import {
  Signal,
  SignalDirection,
  TradeType,
  MarketCandle,
  RiskSettings,
  ConfidenceFactor,
  MarketBias,
  InstrumentConfig,
  Timeframe,
} from '../types';
import {
  runComprehensiveStrategyEngine,
  ComprehensiveStrategyReport,
  defaultNewsRiskProvider,
} from '../strategies';

export function computeSetupFingerprint(
  instrument: string,
  direction: SignalDirection,
  primaryStrategy: string,
  entryTimeframe: string,
  candleTimestamp: number,
  entryZone?: { low: number; high: number } | number
): string {
  const normSym = instrument.replace(/[/_ -]/g, '').toUpperCase();
  let zoneKey = '0';
  if (typeof entryZone === 'number') {
    zoneKey = entryZone.toFixed(4);
  } else if (entryZone && typeof entryZone.low === 'number' && typeof entryZone.high === 'number') {
    zoneKey = `${entryZone.low.toFixed(4)}-${entryZone.high.toFixed(4)}`;
  }
  return `${normSym}:${direction}:${primaryStrategy}:${entryTimeframe}:${candleTimestamp}:${zoneKey}`;
}

export function validateSLTPGeometry(
  directionOrOpts: 'BUY' | 'SELL' | { direction: 'BUY' | 'SELL'; entry: number; stopLoss: number; takeProfit1: number; pipSize?: number },
  entryParam?: number,
  stopLossParam?: number,
  takeProfit1Param?: number
): { valid: boolean; reason?: string; stopLoss: number; takeProfit1: number; entry: number; riskRewardRatio: number } {
  let direction: 'BUY' | 'SELL';
  let entry: number;
  let stopLoss: number;
  let takeProfit1: number;
  let pipSize = 0.0001;

  if (typeof directionOrOpts === 'object') {
    direction = directionOrOpts.direction;
    entry = directionOrOpts.entry;
    stopLoss = directionOrOpts.stopLoss;
    takeProfit1 = directionOrOpts.takeProfit1;
    if (directionOrOpts.pipSize) pipSize = directionOrOpts.pipSize;
  } else {
    direction = directionOrOpts;
    entry = entryParam || 0;
    stopLoss = stopLossParam || 0;
    takeProfit1 = takeProfit1Param || 0;
  }

  let valid = true;
  let reason: string | undefined;

  if (direction === 'BUY') {
    if (stopLoss >= entry) {
      valid = false;
      reason = `Invalid BUY geometry: Stop Loss (${stopLoss}) must be below Entry (${entry}). Auto-correcting.`;
      stopLoss = entry - 20 * pipSize;
    }
    if (takeProfit1 <= entry) {
      valid = false;
      reason = `Invalid BUY geometry: Take Profit (${takeProfit1}) must be above Entry (${entry}). Auto-correcting.`;
      takeProfit1 = entry + Math.abs(entry - stopLoss) * 2;
    }
  } else if (direction === 'SELL') {
    if (stopLoss <= entry) {
      valid = false;
      reason = `Invalid SELL geometry: Stop Loss (${stopLoss}) must be above Entry (${entry}). Auto-correcting.`;
      stopLoss = entry + 20 * pipSize;
    }
    if (takeProfit1 >= entry) {
      valid = false;
      reason = `Invalid SELL geometry: Take Profit (${takeProfit1}) must be below Entry (${entry}). Auto-correcting.`;
      takeProfit1 = entry - Math.abs(entry - stopLoss) * 2;
    }
  }

  const riskDist = Math.abs(entry - stopLoss);
  const rewardDist = Math.abs(takeProfit1 - entry);
  const riskRewardRatio = riskDist > 0 ? Number((rewardDist / riskDist).toFixed(2)) : 2.0;

  return { valid, reason, stopLoss, takeProfit1, entry, riskRewardRatio };
}

export function calculateEntrySLTP(
  instrument: InstrumentConfig,
  direction: 'BUY' | 'SELL',
  currentPrice: number,
  report: ComprehensiveStrategyReport,
  entryCandles: MarketCandle[],
  minRR: number = 1.5
): {
  suggestedEntry: number;
  entryZone: { low: number; high: number };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskRewardRatio: number;
  invalidationCondition: string;
} {
  const lastATR = report.indicators.atr[report.indicators.atr.length - 1] || currentPrice * 0.002;
  const volatilityMultiplier = report.volatility.stopLossMultiplier || 1.0;
  const buffer = Math.max(lastATR * 0.5 * volatilityMultiplier, instrument.pipSize * 3);

  let suggestedEntry = currentPrice;
  let stopLoss: number;
  let takeProfit1: number;
  let takeProfit2: number;
  let invalidationCondition = '';
  let entryZone = { low: currentPrice * 0.999, high: currentPrice * 1.001 };

  const swingHighs = report.indicators.swingHighs;
  const swingLows = report.indicators.swingLows;

  if (direction === 'BUY') {
    suggestedEntry = currentPrice;
    entryZone = { low: currentPrice - buffer * 0.5, high: currentPrice + buffer * 0.3 };

    // Find nearest structural swing low or S/R support zone below entry
    const recentSwingLows = swingLows.filter((s) => s.price < currentPrice);
    let structuralLow = recentSwingLows.length > 0
      ? recentSwingLows[recentSwingLows.length - 1].price
      : currentPrice - buffer * 2;

    // Confluence with modular S/R analysis
    if (report.srAnalysis.nearestSupport && report.srAnalysis.nearestSupport.price < currentPrice) {
      structuralLow = Math.min(structuralLow, report.srAnalysis.nearestSupport.price);
    }

    stopLoss = structuralLow - buffer;
    const riskDistance = suggestedEntry - stopLoss;

    if (riskDistance <= 0) {
      stopLoss = suggestedEntry - buffer * 2;
    }
    const finalRisk = suggestedEntry - stopLoss;

    // TP1 targeted at 1:2 or next key resistance
    const targetRR1 = Math.max(2.0, minRR);
    const targetRR2 = targetRR1 + 1.2;

    // Check if nearest resistance provides a structural ceiling target
    if (
      report.srAnalysis.nearestResistance &&
      report.srAnalysis.nearestResistance.price > suggestedEntry + finalRisk * 1.5
    ) {
      takeProfit1 = report.srAnalysis.nearestResistance.price;
      takeProfit2 = suggestedEntry + finalRisk * targetRR2;
    } else {
      takeProfit1 = suggestedEntry + finalRisk * targetRR1;
      takeProfit2 = suggestedEntry + finalRisk * targetRR2;
    }

    const actualRR = (takeProfit1 - suggestedEntry) / finalRisk;
    const levelRef = report.srAnalysis.nearestSupport
      ? `S/R ${report.srAnalysis.nearestSupport.price.toFixed(instrument.digits)}`
      : `swing low ${stopLoss.toFixed(instrument.digits)}`;
    invalidationCondition = `Bullish thesis invalidated if 1-candle close occurs below ${levelRef} or if lower timeframe prints a Bearish CHoCH.`;

    return {
      suggestedEntry: Number(suggestedEntry.toFixed(instrument.digits)),
      entryZone: {
        low: Number(entryZone.low.toFixed(instrument.digits)),
        high: Number(entryZone.high.toFixed(instrument.digits)),
      },
      stopLoss: Number(stopLoss.toFixed(instrument.digits)),
      takeProfit1: Number(takeProfit1.toFixed(instrument.digits)),
      takeProfit2: Number(takeProfit2.toFixed(instrument.digits)),
      riskRewardRatio: Number(actualRR.toFixed(2)),
      invalidationCondition,
    };
  } else {
    suggestedEntry = currentPrice;
    entryZone = { low: currentPrice - buffer * 0.3, high: currentPrice + buffer * 0.5 };

    // Find nearest structural swing high or S/R resistance zone above entry
    const recentSwingHighs = swingHighs.filter((s) => s.price > currentPrice);
    let structuralHigh = recentSwingHighs.length > 0
      ? recentSwingHighs[recentSwingHighs.length - 1].price
      : currentPrice + buffer * 2;

    // Confluence with modular S/R analysis
    if (report.srAnalysis.nearestResistance && report.srAnalysis.nearestResistance.price > currentPrice) {
      structuralHigh = Math.max(structuralHigh, report.srAnalysis.nearestResistance.price);
    }

    stopLoss = structuralHigh + buffer;
    const riskDistance = stopLoss - suggestedEntry;

    if (riskDistance <= 0) {
      stopLoss = suggestedEntry + buffer * 2;
    }
    const finalRisk = stopLoss - suggestedEntry;

    const targetRR1 = Math.max(2.0, minRR);
    const targetRR2 = targetRR1 + 1.2;

    // Check if nearest support provides a structural floor target
    if (
      report.srAnalysis.nearestSupport &&
      report.srAnalysis.nearestSupport.price < suggestedEntry - finalRisk * 1.5
    ) {
      takeProfit1 = report.srAnalysis.nearestSupport.price;
      takeProfit2 = suggestedEntry - finalRisk * targetRR2;
    } else {
      takeProfit1 = suggestedEntry - finalRisk * targetRR1;
      takeProfit2 = suggestedEntry - finalRisk * targetRR2;
    }

    const actualRR = (suggestedEntry - takeProfit1) / finalRisk;
    const levelRef = report.srAnalysis.nearestResistance
      ? `S/R ${report.srAnalysis.nearestResistance.price.toFixed(instrument.digits)}`
      : `swing high ${stopLoss.toFixed(instrument.digits)}`;
    invalidationCondition = `Bearish thesis invalidated if 1-candle close occurs above ${levelRef} or if lower timeframe prints a Bullish CHoCH.`;

    return {
      suggestedEntry: Number(suggestedEntry.toFixed(instrument.digits)),
      entryZone: {
        low: Number(entryZone.low.toFixed(instrument.digits)),
        high: Number(entryZone.high.toFixed(instrument.digits)),
      },
      stopLoss: Number(stopLoss.toFixed(instrument.digits)),
      takeProfit1: Number(takeProfit1.toFixed(instrument.digits)),
      takeProfit2: Number(takeProfit2.toFixed(instrument.digits)),
      riskRewardRatio: Number(actualRR.toFixed(2)),
      invalidationCondition,
    };
  }
}

export function generateSignalDecision(
  instrument: InstrumentConfig,
  tradeType: TradeType,
  entryCandles: MarketCandle[],
  contextCandles: MarketCandle[],
  riskSettings: RiskSettings,
  aiExplanationOverride?: { explanation: string; invalidation?: string },
  additionalCandlesByTimeframe?: {
    M5?: MarketCandle[];
    M15?: MarketCandle[];
    H1?: MarketCandle[];
    H4?: MarketCandle[];
    D1?: MarketCandle[];
  }
): Signal {
  const contextTF: Timeframe = tradeType === 'SCALP' ? 'M15' : tradeType === 'DAY' ? 'H1' : 'H4';
  const entryTF: Timeframe = tradeType === 'SCALP' ? 'M5' : tradeType === 'DAY' ? 'M15' : 'H1';
  const signalId = `SIG-${instrument.symbol.replace(/[/_ -]/g, '')}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

  // 1. Guard: If insufficient candle history from provider, return disciplined WAIT signal
  if (!entryCandles || entryCandles.length < 15) {
    const fallbackPrice = entryCandles && entryCandles.length > 0 ? entryCandles[entryCandles.length - 1].close : 0;
    return {
      id: signalId,
      signalId,
      instrument: instrument.symbol,
      symbol: instrument.symbol,
      assetClass: instrument.assetClass,
      tradeType,
      direction: 'WAIT',
      timeframe: entryTF,
      currentPrice: fallbackPrice,
      suggestedEntry: fallbackPrice,
      entry: fallbackPrice,
      stopLoss: fallbackPrice,
      takeProfit1: fallbackPrice,
      takeProfit2: fallbackPrice,
      riskRewardRatio: 0,
      riskReward: 0,
      aiConfidence: 30,
      confidenceScore: 30,
      marketBias: 'NEUTRAL',
      timeframeUsed: {
        context: contextTF,
        entry: entryTF,
      },
      conditionsDetected: ['Awaiting live candle series from market provider'],
      reasons: ['DATA UNAVAILABLE: Minimum 15 candles required across timeframes for disciplined analysis.'],
      confidenceFactors: [
        {
          name: 'Data Feed Readiness',
          category: 'DISCIPLINE',
          weight: 100,
          score: 30,
          detail: 'Awaiting sufficient live historical candles to compute algorithmic indicators.',
        },
      ],
      strategyBreakdown: {
        trendFollowing: false,
        breakout: false,
        pullback: false,
        supportResistance: false,
        marketStructure: false,
        liquiditySweep: false,
        momentum: false,
        volatility: false,
        mtfConfluence: false,
      },
      setupExplanation: 'WAIT — DATA UNAVAILABLE. Awaiting sufficient historical candlestick feed from market data provider.',
      invalidationCondition: 'Thesis pending real-time data sync.',
      invalidation: 'Thesis pending real-time data sync.',
      timestamp: Date.now(),
      createdAt: Date.now(),
      status: 'INVALIDATED',
    };
  }

  const currentPrice = entryCandles[entryCandles.length - 1].close;

  // 2. Run Comprehensive Strategy Engine
  const report = runComprehensiveStrategyEngine(
    instrument.symbol,
    entryCandles,
    contextCandles || entryCandles,
    tradeType,
    additionalCandlesByTimeframe
  );

  const activeMetConditions = report.conditions.filter((c) => c.met);
  const detectedConditionNames = activeMetConditions.map((c) => c.name);
  const reasons: string[] = [];

  // 3. Preliminary Decision Evaluation
  let direction: SignalDirection = 'WAIT';

  // Extreme Volatility Rule: If market is erratic or gapping uncontrollably, return WAIT immediately
  if (!report.volatility.isTradeSuitable) {
    direction = 'WAIT';
    reasons.push(`Extreme Volatility: ${report.volatility.reason} (ATR: ${report.volatility.atrPercent}% of price).`);
  } else {
    // Check Directional Alignment
    const hasBullConfluence =
      report.dominantBias === 'BULLISH' &&
      report.bullishScore >= 30 &&
      report.mtfAnalysis.contextBias !== 'BEARISH' &&
      activeMetConditions.filter((c) => c.bias === 'BULLISH').length >= 2;

    const hasBearConfluence =
      report.dominantBias === 'BEARISH' &&
      report.bearishScore >= 30 &&
      report.mtfAnalysis.contextBias !== 'BULLISH' &&
      activeMetConditions.filter((c) => c.bias === 'BEARISH').length >= 2;

    if (hasBullConfluence) {
      direction = 'BUY';
      reasons.push('Bullish multi-timeframe order flow and structure confluence confirmed.');
    } else if (hasBearConfluence) {
      direction = 'SELL';
      reasons.push('Bearish multi-timeframe order flow and structure confluence confirmed.');
    } else {
      direction = 'WAIT';
      reasons.push('Market in consolidation or conflicting multi-timeframe conditions.');
    }
  }

  // 4. Calculate Risk / Reward and Levels (anchored to originating closed candle for deterministic setup identity)
  const originatingCandle = entryCandles[entryCandles.length - 1];
  const referencePrice = originatingCandle ? originatingCandle.close : currentPrice;

  let entryCalc = {
    suggestedEntry: referencePrice,
    entryZone: { low: referencePrice * 0.999, high: referencePrice * 1.001 },
    stopLoss: referencePrice * 0.995,
    takeProfit1: referencePrice * 1.01,
    takeProfit2: referencePrice * 1.018,
    riskRewardRatio: 2.0,
    invalidationCondition: 'Thesis invalidated if market structure breaks opposite.',
  };

  if (direction !== 'WAIT') {
    entryCalc = calculateEntrySLTP(
      instrument,
      direction,
      referencePrice,
      report,
      entryCandles,
      riskSettings.minRiskReward
    );

    // Rule: Validate geometric validity (BUY: SL < Entry < TP; SELL: TP < Entry < SL)
    const geomCheck = validateSLTPGeometry(direction, entryCalc.suggestedEntry, entryCalc.stopLoss, entryCalc.takeProfit1);
    if (!geomCheck.valid) {
      direction = 'WAIT';
      const geomRejection = `Rejected by Risk Engine: ${geomCheck.reason}`;
      detectedConditionNames.push(geomRejection);
      reasons.push(geomRejection);
    }

    // Rule: Filter out signals where R:R < minRR
    if (entryCalc.riskRewardRatio < riskSettings.minRiskReward) {
      direction = 'WAIT';
      const rrRejection = `Rejected by Risk Engine: Calculated R:R (1:${entryCalc.riskRewardRatio.toFixed(2)}) is below minimum threshold (1:${riskSettings.minRiskReward.toFixed(1)}).`;
      detectedConditionNames.push(rrRejection);
      reasons.push(rrRejection);
    }
  }

  // 5. Compute Confidence Score & Breakdown via Confluence Engine
  const { confidenceScore, confidenceBreakdown, confluence } = report;

  // Filter check: If confidence below required threshold, demote to WAIT
  if (direction !== 'WAIT' && confidenceScore < riskSettings.minConfidenceRequired) {
    direction = 'WAIT';
    const confRejection = `Rejected by Confidence Engine: Total Confidence (${confidenceScore}/100) is below minimum threshold (${riskSettings.minConfidenceRequired}/100).`;
    detectedConditionNames.push(confRejection);
    reasons.push(confRejection);
  }

  // 6. Primary Strategy Identification & Assemble Final Reasons
  const validStrategy = report.strategyResults.find((s) => s.valid && s.direction === direction);
  const primaryStrategy = validStrategy ? validStrategy.strategyName : 'TREND_FOLLOWING';

  for (const s of report.strategyResults) {
    if (s.valid && s.direction === direction) {
      reasons.push(`[${s.strategyName}] ${s.reason}`);
    }
  }
  if (reasons.length === 0) {
    reasons.push(report.marketRegime.description);
  }

  // Convert evidence to confidence factors for backwards compatibility
  const confidenceFactors: ConfidenceFactor[] = confluence.evidence.map((e) => ({
    name: e.source,
    category: e.classification,
    weight: e.weight,
    score: e.classification === 'STRONG_SUPPORT' ? 100 : e.classification === 'SUPPORT' ? 80 : e.classification === 'NEUTRAL' ? 50 : 20,
    detail: e.detail,
  }));

  // 7. Explanations
  let defaultExplanation = '';
  if (direction === 'BUY') {
    defaultExplanation = `BUY SETUP: Strong bullish confluence identified across ${contextTF} macro bias and ${entryTF} execution structure. Key triggers include ${activeMetConditions.map((c) => c.name).join(', ')}. Market regime is ${report.marketRegime.regime.replace(/_/g, ' ')}. Stop loss is stationed below structural pivot (${entryCalc.stopLoss.toFixed(instrument.digits)}) with asymmetric upside target (${entryCalc.takeProfit1.toFixed(instrument.digits)}).`;
  } else if (direction === 'SELL') {
    defaultExplanation = `SELL SETUP: Strong bearish confluence identified across ${contextTF} macro bias and ${entryTF} execution structure. Key triggers include ${activeMetConditions.map((c) => c.name).join(', ')}. Market regime is ${report.marketRegime.regime.replace(/_/g, ' ')}. Stop loss is stationed above structural pivot (${entryCalc.stopLoss.toFixed(instrument.digits)}) with asymmetric downside target (${entryCalc.takeProfit1.toFixed(instrument.digits)}).`;
  } else {
    defaultExplanation = `WAIT — NO VALID SETUP: Market is currently in ${report.marketRegime.regime.replace(/_/g, ' ')} (${report.marketRegime.primaryCharacteristic}). Conditions do not meet high-probability confluence criteria. Preserving capital until verified edge develops.`;
  }

  const newsRisk = defaultNewsRiskProvider.getNewsRisk(instrument.symbol);
  const now = Date.now();
  const candleTimestamp = originatingCandle ? originatingCandle.time : now;
  const provider = instrument.provider || 'Twelve Data';

  const setupFingerprint = computeSetupFingerprint(
    instrument.symbol,
    direction,
    primaryStrategy,
    entryTF,
    candleTimestamp,
    entryCalc.entryZone
  );

  return {
    id: signalId,
    signalId,
    instrument: instrument.symbol,
    symbol: instrument.symbol,
    assetClass: instrument.assetClass,
    direction,
    tradeType,
    timeframe: entryTF,
    strategy: primaryStrategy,
    candleTimestamp,
    scanTimestamp: now,
    timestamp: now,
    createdAt: now,
    provider,
    dataSource: provider,
    marketPriceAtCreation: Number(currentPrice.toFixed(instrument.digits)),
    setupFingerprint,
    currentPrice: Number(currentPrice.toFixed(instrument.digits)),
    suggestedEntry: entryCalc.suggestedEntry,
    entry: entryCalc.suggestedEntry,
    entryZone: entryCalc.entryZone,
    stopLoss: entryCalc.stopLoss,
    takeProfit1: entryCalc.takeProfit1,
    takeProfit2: entryCalc.takeProfit2,
    riskRewardRatio: entryCalc.riskRewardRatio,
    riskReward: entryCalc.riskRewardRatio,
    aiConfidence: confidenceScore,
    confidenceScore,
    confidenceBreakdown,
    marketBias: report.dominantBias,
    marketRegime: report.marketRegime,
    strategyResults: report.strategyResults,
    confluence,
    reasons,
    setupExplanation: aiExplanationOverride?.explanation || defaultExplanation,
    conditionsDetected: detectedConditionNames.length > 0 ? detectedConditionNames : ['Consolidation / Low Confluence'],
    invalidationCondition: aiExplanationOverride?.invalidation || entryCalc.invalidationCondition,
    invalidation: aiExplanationOverride?.invalidation || entryCalc.invalidationCondition,
    status: direction === 'WAIT' ? 'INVALIDATED' : 'ACTIVE',
    timeframeUsed: {
      context: contextTF,
      entry: entryTF,
    },
    confidenceFactors,
    strategyBreakdown: report.breakdown,
    newsRisk,
  };
}
