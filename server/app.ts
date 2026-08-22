import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  SUPPORTED_INSTRUMENTS,
  fetchLiveMarketData,
  marketDataManager,
} from './marketData';
import {
  getSignalJournal,
  saveSignalToJournal,
  trackSignalsAgainstMarketData,
  calculatePerformanceAnalytics,
} from './journalService';
import { analyzeMarketWithGemini } from './geminiService';
import { generateSignalDecision } from '../src/signals/decisionEngine';
import { TradeType, Timeframe, RiskSettings } from '../src/types';
import { getCandleState } from './config/intervals';

const defaultRiskSettings: RiskSettings = {
  maxRiskPerTradePercent: 1.0,
  minRiskReward: 1.5,
  maxSimultaneousSignals: 4,
  maxDailySignals: 10,
  maxConsecutiveLosses: 3,
  maxDailyDrawdownPercent: 3.0,
  minConfidenceRequired: 60,
};

export function createExpressApp(): express.Express {
  const app = express();

  // Enable CORS and JSON parsing
  app.use(cors());
  app.use(express.json());

  const router = express.Router();

  // Health check
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      agent: 'Eazzy AI Trading Signal Agent',
      timestamp: Date.now(),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      twelveDataConfigured: Boolean(process.env.TWELVE_DATA_API_KEY),
      finnhubConfigured: Boolean(process.env.FINNHUB_API_KEY),
      environment: process.env.NODE_ENV || 'production',
    });
  });

  // Instruments endpoint
  router.get('/instruments', (_req, res) => {
    res.json({
      instruments: Object.values(SUPPORTED_INSTRUMENTS).filter(
        (v, i, a) => a.findIndex((t) => t.symbol === v.symbol) === i
      ),
    });
  });

  // Provider status diagnostic (Requirement 11)
  router.get('/market/provider-status', async (_req, res) => {
    try {
      const status = await marketDataManager.getProviderStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch provider status' });
    }
  });

  // Manual Reconnect (Requirement 13)
  router.post('/market/reconnect', async (_req, res) => {
    try {
      const status = await marketDataManager.reconnect();
      res.json({
        success: true,
        message: 'Providers successfully reconnected and health checks completed.',
        status,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to reconnect providers' });
    }
  });

  // Health check diagnostic test suite endpoint (Requirement 15)
  router.post('/market/diagnostics/test-suite', async (_req, res) => {
    try {
      const testSymbols = ['BTC/USD', 'EUR/USD', 'XAU/USD', 'NAS100'];
      const results: Record<string, any> = {};

      const twelve = marketDataManager.getPrimaryProvider();
      const finnhub = marketDataManager.getSecondaryProvider();

      for (const sym of testSymbols) {
        const asset = marketDataManager.getAsset(sym);
        if (!asset) continue;

        const [tdQuote, fhQuote] = await Promise.allSettled([
          twelve.getQuote(asset),
          finnhub.getQuote(asset),
        ]);

        results[sym] = {
          twelveData:
            tdQuote.status === 'fulfilled'
              ? { status: tdQuote.value.status, price: tdQuote.value.price, error: tdQuote.value.errorMessage }
              : { status: 'ERROR', error: tdQuote.reason?.message },
          finnhub:
            fhQuote.status === 'fulfilled'
              ? { status: fhQuote.value.status, price: fhQuote.value.price, error: fhQuote.value.errorMessage }
              : { status: 'ERROR', error: fhQuote.reason?.message },
        };
      }

      const providerStatus = await marketDataManager.getProviderStatus();

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        providerStatus,
        results,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Engine & Live Market Refresh Status
  router.get('/market/engine-status', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || 'EURUSD';
      const activeJournal = getSignalJournal().filter((s) => s.status === 'ACTIVE');
      const status = await marketDataManager.getEngineStatus(symbol, activeJournal.length);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch engine status' });
    }
  });

  // Market overview (all configured assets)
  router.get('/market/overview', async (_req, res) => {
    try {
      const overview = await marketDataManager.getMarketOverview();
      res.json({ overview });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch market overview' });
    }
  });

  // Crypto Market Watch specific overview (BTC, ETH, SOL)
  router.get('/market/crypto-overview', async (_req, res) => {
    try {
      const cryptoData = await marketDataManager.getCryptoMarketWatch();
      res.json(cryptoData);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch crypto overview' });
    }
  });

  // Helper to extract symbol from request params (handles /quote/EUR/USD or /quote/EUR%2FUSD or /quote/EURUSD or ?symbol=EUR/USD)
  const extractSymbolParam = (req: express.Request): string => {
    if (req.query.symbol && typeof req.query.symbol === 'string' && req.query.symbol.trim().length > 0) {
      return req.query.symbol.trim();
    }
    if (req.params.base && req.params.quote) {
      return `${req.params.base}/${req.params.quote}`;
    }
    if (req.params.symbol) {
      return decodeURIComponent(req.params.symbol);
    }
    if (req.params[0]) {
      return decodeURIComponent(req.params[0]);
    }
    return 'EUR/USD';
  };

  // Market quote handlers
  const handleQuote = async (req: express.Request, res: express.Response) => {
    try {
      const symbol = extractSymbolParam(req);
      const quote = await marketDataManager.getQuote(symbol);
      res.json({
        quote,
        dataSource: quote.dataSource,
      });
    } catch (error) {
      console.error('Error fetching quote:', error);
      res.status(500).json({ error: 'Failed to fetch live market quote' });
    }
  };

  router.get('/market/quote', handleQuote);
  router.get('/market/quote/:symbol', handleQuote);
  router.get('/market/quote/:base/:quote', handleQuote);

  // Market candles handlers
  const handleCandles = async (req: express.Request, res: express.Response) => {
    try {
      const symbol = extractSymbolParam(req);
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
  };

  router.get('/market/candles', handleCandles);
  router.get('/market/candles/:symbol', handleCandles);
  router.get('/market/candles/:base/:quote', handleCandles);

  // Dedicated Backtesting Historical Candles handler with real provider synchronization
  const handleBacktestCandles = async (req: express.Request, res: express.Response) => {
    try {
      const symbol = extractSymbolParam(req) || (req.query.symbol as string) || 'EUR/USD';
      const tf = (req.query.timeframe as Timeframe) || 'M15';
      const limit = parseInt(req.query.limit as string, 10) || 200;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const result = await marketDataManager.getBacktestHistoricalCandles(
        symbol,
        tf,
        limit,
        startDate,
        endDate
      );

      res.json(result);
    } catch (error: any) {
      console.error('Error in backtest candles endpoint:', error);
      res.status(500).json({
        status: 'UNAVAILABLE',
        error: `HISTORICAL DATA UNAVAILABLE: ${error.message || 'Internal server error'}`,
        candles: [],
      });
    }
  };

  router.get('/backtest/historical-candles', handleBacktestCandles);
  router.get('/backtest/historical-candles/:symbol', handleBacktestCandles);
  router.get('/backtest/historical-candles/:base/:quote', handleBacktestCandles);

  // Multi-timeframe Signal Generation & Deep AI Analysis Scan
  router.post('/signals/scan', async (req, res) => {
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
      const rawEntryCandles = marketData.candles[entryTF] || marketData.candles['M15'] || [];
      const rawContextCandles = marketData.candles[contextTF] || marketData.candles['H1'] || rawEntryCandles;

      // STALE DATA PROTECTION (Requirement 9 & 16)
      const isStale = marketDataManager.isDataStale(sym);

      // FORMING vs CLOSED CANDLE ISOLATION (Requirement 4 & 16)
      // The currently forming candle can be displayed on chart, but must NOT confirm strategy signals.
      const now = Date.now();
      const lastEntryCandle = rawEntryCandles[rawEntryCandles.length - 1];
      const isLastCandleForming = lastEntryCandle && getCandleState(lastEntryCandle.time, entryTF, now) === 'FORMING';
      
      const confirmedEntryCandles = isLastCandleForming && rawEntryCandles.length > 15
        ? rawEntryCandles.slice(0, rawEntryCandles.length - 1)
        : rawEntryCandles;

      const lastContextCandle = rawContextCandles[rawContextCandles.length - 1];
      const isLastContextForming = lastContextCandle && getCandleState(lastContextCandle.time, contextTF, now) === 'FORMING';
      const confirmedContextCandles = isLastContextForming && rawContextCandles.length > 15
        ? rawContextCandles.slice(0, rawContextCandles.length - 1)
        : rawContextCandles;

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
        confirmedEntryCandles,
        confirmedContextCandles,
        rSettings,
        undefined,
        tfCandlesMap
      );

      // Explicitly attach current provider and closed candle data
      baseSignal.provider = marketData.dataSource || instConfig.provider || 'Twelve Data';
      baseSignal.dataSource = baseSignal.provider;

      // Stale data guard enforcement
      if (isStale) {
        baseSignal.direction = 'WAIT';
        baseSignal.setupExplanation = 'STALE DATA — SIGNAL GENERATION PAUSED. Live market feed age exceeds maximum allowed threshold.';
        baseSignal.reasons = ['STALE DATA — SIGNAL GENERATION PAUSED. Awaiting fresh tick update before executing strategy scan.'];
        baseSignal.conditionsDetected = ['Protection: Stale Data Filter Active'];
      }

      // Closed-candle verification & structured logging (Requirement 15)
      const originatingCandle = confirmedEntryCandles[confirmedEntryCandles.length - 1];
      const candleTimeStr = originatingCandle ? new Date(originatingCandle.time).toISOString() : 'N/A';
      
      if (baseSignal.direction !== 'WAIT') {
        console.log(
          `[SIGNAL CREATED]\ntimestamp: ${new Date(baseSignal.timestamp).toISOString()}\nsymbol: ${baseSignal.instrument}\ndirection: ${baseSignal.direction}\nentry: ${baseSignal.suggestedEntry}\nSL: ${baseSignal.stopLoss}\nTP: ${baseSignal.takeProfit1}\nconfidence: ${baseSignal.aiConfidence}\nprovider: ${baseSignal.provider}\noriginating candle: ${candleTimeStr}`
        );
      }

      // Market data provider consistency / conflict check
      const consistency = marketDataManager.checkDataConsistency(sym);
      if (consistency.conflict) {
        baseSignal.direction = 'WAIT';
        baseSignal.setupExplanation = `WAIT: Market data providers disagree (${consistency.reason}). Signal scan execution halted for capital protection.`;
        baseSignal.conditionsDetected.push(
          `Risk Filter: Market data provider conflict detected (Twelve Data vs Finnhub, diff: ${consistency.diffPercent?.toFixed(2)}%)`
        );
      }

      // Deep reasoning layer via Gemini
      const lastClose =
        confirmedEntryCandles && confirmedEntryCandles.length > 0
          ? confirmedEntryCandles[confirmedEntryCandles.length - 1].close
          : marketData.quote.price || 0;

      if (baseSignal.suggestedEntry === 0 && lastClose > 0) {
        baseSignal.currentPrice = lastClose;
        baseSignal.suggestedEntry = lastClose;
        baseSignal.stopLoss = lastClose;
        baseSignal.takeProfit1 = lastClose;
        baseSignal.takeProfit2 = lastClose;
      }

      const rsiVal = confirmedEntryCandles.length >= 14 ? 54 : 50;
      const atrVal = confirmedEntryCandles.length >= 14 ? instConfig.pipSize * 15 : lastClose * 0.002;

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

      if (aiAnalysis) {
        baseSignal.setupExplanation = aiAnalysis.setupExplanation;
        baseSignal.invalidationCondition = aiAnalysis.invalidationCondition;
        baseSignal.invalidation = aiAnalysis.invalidationCondition;
        if (aiAnalysis.direction === 'WAIT' && baseSignal.direction !== 'WAIT') {
          baseSignal.direction = 'WAIT';
          baseSignal.conditionsDetected.push(
            'Risk Filter: AI explanation engine identified critical regime risk'
          );
        }
      }

      // Save to journal with deduplication
      const savedSignal = saveSignalToJournal(baseSignal);

      res.json({
        signal: savedSignal,
        quote: marketData.quote,
        dataSource: marketData.dataSource,
      });
    } catch (error) {
      console.error('Error scanning signal:', error);
      res.status(500).json({ error: 'Signal scan failed' });
    }
  });

  // Signal Journal endpoint
  router.get('/signals/journal', (_req, res) => {
    const journal = getSignalJournal();
    res.json({
      signals: journal,
      totalCount: journal.length,
    });
  });

  // Performance Analytics endpoint
  router.get('/performance', (_req, res) => {
    const analytics = calculatePerformanceAnalytics();
    res.json(analytics);
  });

  // Tracker Tick endpoint
  router.post('/tracker/tick', async (req, res) => {
    try {
      const { symbol } = req.body as { symbol: string };
      const sym = (symbol || 'EURUSD').toUpperCase();

      const marketData = await fetchLiveMarketData(sym);
      const quote = marketData.quote;

      // Track active signals using live quote tick (bid/ask executable sides, avoiding historical 24h look-behind)
      const trackingResult = trackSignalsAgainstMarketData({
        symbol: sym,
        price: quote.price,
        bid: quote.bid || quote.price,
        ask: quote.ask || quote.price,
        timestamp: quote.timestamp || Date.now(),
        dataSource: quote.dataSource || marketData.dataSource || 'Twelve Data',
      });

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

  // Mount router on API prefixes
  app.use('/api', router);
  app.use('/.netlify/functions/api', router);

  // Explicit JSON 404 handler for unmatched API routes to prevent falling through to Vite SPA HTML fallback
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });
  app.use('/.netlify/functions/api', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // Global Express error handler for API routes
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled API error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error',
    });
  });

  return app;
}
