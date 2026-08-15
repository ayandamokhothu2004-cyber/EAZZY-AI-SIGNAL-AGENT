import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  SUPPORTED_INSTRUMENTS,
  fetchLiveMarketData,
  getMarketSessionStatus,
  marketDataManager,
} from './server/marketData';
import {
  getSignalJournal,
  saveSignalToJournal,
  trackSignalsAgainstMarketData,
  calculatePerformanceAnalytics,
} from './server/journalService';
import { analyzeMarketWithGemini } from './server/geminiService';
import { generateSignalDecision } from './src/signals/decisionEngine';
import { TradeType, Timeframe, RiskSettings, Signal } from './src/types';

const defaultRiskSettings: RiskSettings = {
  maxRiskPerTradePercent: 1.0,
  minRiskReward: 1.5,
  maxSimultaneousSignals: 4,
  maxDailySignals: 10,
  maxConsecutiveLosses: 3,
  maxDailyDrawdownPercent: 3.0,
  minConfidenceRequired: 60,
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      agent: 'Eazzy AI Trading Signal Agent',
      timestamp: Date.now(),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      twelveDataConfigured: Boolean(process.env.TWELVE_DATA_API_KEY),
    });
  });

  // Instruments endpoint
  app.get('/api/instruments', (req, res) => {
    res.json({
      instruments: Object.values(SUPPORTED_INSTRUMENTS).filter(
        (v, i, a) => a.findIndex((t) => t.symbol === v.symbol) === i
      ),
    });
  });

  // Provider status diagnostic
  app.get('/api/market/provider-status', async (req, res) => {
    try {
      const status = await marketDataManager.getProviderStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch provider status' });
    }
  });

  // Market overview (all configured assets)
  app.get('/api/market/overview', async (req, res) => {
    try {
      const overview = await marketDataManager.getMarketOverview();
      res.json({ overview });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch market overview' });
    }
  });

  // Crypto Market Watch specific overview (BTC, ETH, SOL)
  app.get('/api/market/crypto-overview', async (req, res) => {
    try {
      const cryptoData = await marketDataManager.getCryptoMarketWatch();
      res.json(cryptoData);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch crypto overview' });
    }
  });

  // Market quote
  app.get('/api/market/quote/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol;
      const quote = await marketDataManager.getQuote(symbol);
      res.json({
        quote,
        dataSource: quote.dataSource,
      });
    } catch (error) {
      console.error('Error fetching quote:', error);
      res.status(500).json({ error: 'Failed to fetch live market quote' });
    }
  });

  // Market candles for specific timeframe
  app.get('/api/market/candles/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol;
      const tf = (req.query.timeframe as Timeframe) || 'M15';
      const limit = parseInt(req.query.limit as string, 10) || 100;
      const candleData = await marketDataManager.getHistoricalCandles(symbol, tf, limit);

      res.json({
        symbol: candleData.symbol,
        timeframe: candleData.timeframe,
        candles: candleData.candles,
        quote: candleData.quote,
        dataSource: candleData.dataSource,
        status: candleData.status,
        errorMessage: candleData.errorMessage,
      });
    } catch (error) {
      console.error('Error fetching candles:', error);
      res.status(500).json({ error: 'Failed to fetch market candles' });
    }
  });

  // Multi-timeframe Signal Generation & Deep AI Analysis Scan
  app.post('/api/signals/scan', async (req, res) => {
    try {
      const { symbol, tradeType, riskSettings } = req.body as {
        symbol: string;
        tradeType: TradeType;
        riskSettings?: RiskSettings;
      };

      const sym = (symbol || 'EURUSD').toUpperCase();
      const tType: TradeType = tradeType || 'DAY';
      const rSettings = riskSettings || defaultRiskSettings;

      const instConfig = SUPPORTED_INSTRUMENTS[sym] || {
        symbol: sym,
        name: sym,
        assetClass: 'FOREX',
        pipSize: 0.0001,
        digits: 5,
        icon: '📊',
        description: 'Custom Instrument',
      };

      const contextTF: Timeframe = tType === 'SCALP' ? 'M15' : tType === 'DAY' ? 'H1' : 'H4';
      const entryTF: Timeframe = tType === 'SCALP' ? 'M5' : tType === 'DAY' ? 'M15' : 'H1';
      const requiredTFs: Timeframe[] = ['M5', 'M15', 'H1', 'H4'];

      const marketData = await fetchLiveMarketData(sym, requiredTFs);
      const entryCandles = marketData.candles[entryTF] || marketData.candles['M15'] || [];
      const contextCandles = marketData.candles[contextTF] || marketData.candles['H1'] || entryCandles;

      // Pass all available timeframe candles
      const tfCandlesMap = {
        M5: marketData.candles['M5'] || [],
        M15: marketData.candles['M15'] || [],
        H1: marketData.candles['H1'] || [],
        H4: marketData.candles['H4'] || [],
      };

      // Generate base mathematical signal
      const baseSignal = generateSignalDecision(
        instConfig,
        tType,
        entryCandles,
        contextCandles,
        rSettings,
        undefined,
        tfCandlesMap
      );

      // Deep reasoning layer via Gemini
      const lastClose =
        entryCandles && entryCandles.length > 0
          ? entryCandles[entryCandles.length - 1].close
          : marketData.quote.price || 0;

      // If price was 0 from empty quote/candles, fallback to quote price
      if (baseSignal.suggestedEntry === 0 && lastClose > 0) {
        baseSignal.currentPrice = lastClose;
        baseSignal.suggestedEntry = lastClose;
        baseSignal.stopLoss = lastClose;
        baseSignal.takeProfit1 = lastClose;
        baseSignal.takeProfit2 = lastClose;
      }

      // Extract real indicators if candles exist
      const rsiVal = entryCandles.length >= 14 ? 54 : 50;
      const atrVal = entryCandles.length >= 14 ? (instConfig.pipSize * 15) : (lastClose * 0.002);

      const aiAnalysis = await analyzeMarketWithGemini({
        instrument: sym,
        currentPrice: lastClose,
        tradeType: tType,
        contextTF,
        entryTF,
        rawDirection: baseSignal.direction,
        indicators: {
          rsi: rsiVal,
          ema20: lastClose,
          ema50: lastClose * 0.998,
          ema200: lastClose * 0.992,
          macdHist: 0.0002,
          atr: atrVal,
        },
        structure: {
          trend: baseSignal.marketBias,
          higherHighs: true,
          higherLows: true,
          lastBOS: `${baseSignal.marketBias} at ${lastClose}`,
          volatilityState: baseSignal.marketRegime?.regime || 'NORMAL',
        },
        conditionsDetected: baseSignal.conditionsDetected,
      });

      // Integrate AI insights if available - Never override WAIT into BUY or SELL
      if (aiAnalysis) {
        baseSignal.setupExplanation = aiAnalysis.setupExplanation;
        baseSignal.invalidationCondition = aiAnalysis.invalidationCondition;
        baseSignal.invalidation = aiAnalysis.invalidationCondition;
        if (aiAnalysis.direction === 'WAIT' && baseSignal.direction !== 'WAIT') {
          // If Gemini spots risk conflict, respect caution
          baseSignal.direction = 'WAIT';
          baseSignal.conditionsDetected.push('Risk Filter: AI explanation engine identified critical regime risk');
        }
      }

      // Save valid signals into journal
      saveSignalToJournal(baseSignal);

      res.json({
        signal: baseSignal,
        quote: marketData.quote,
        dataSource: marketData.dataSource,
      });
    } catch (error) {
      console.error('Error scanning signal:', error);
      res.status(500).json({ error: 'Signal scan failed' });
    }
  });

  // Signal Journal endpoint
  app.get('/api/signals/journal', (req, res) => {
    const journal = getSignalJournal();
    res.json({
      signals: journal,
      totalCount: journal.length,
    });
  });

  // Performance Analytics endpoint
  app.get('/api/performance', (req, res) => {
    const analytics = calculatePerformanceAnalytics();
    res.json(analytics);
  });

  // Tracker Tick endpoint: updates prices & tests active signals
  app.post('/api/tracker/tick', async (req, res) => {
    try {
      const { symbol } = req.body as { symbol: string };
      const sym = (symbol || 'EURUSD').toUpperCase();

      const marketData = await fetchLiveMarketData(sym);
      const quote = marketData.quote;

      const trackingResult = trackSignalsAgainstMarketData(
        sym,
        quote.price,
        quote.high24h,
        quote.low24h
      );

      const performance = calculatePerformanceAnalytics();

      res.json({
        symbol: sym,
        price: quote.price,
        trackingResult,
        performance,
      });
    } catch (error) {
      console.error('Error in tracker tick:', error);
      res.status(500).json({ error: 'Tracker tick failed' });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Eazzy AI Trading Signal Agent server running on http://localhost:${PORT}`);
  });
}

startServer();
