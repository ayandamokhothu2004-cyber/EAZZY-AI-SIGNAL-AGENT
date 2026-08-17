import { MarketCandle } from '../types';
import {
  BacktestTrade,
  BacktestConfig,
  ExitConflictRule,
  TradeResultType,
  ExitReason,
} from '../types/backtest';

export interface PendingTradeSetup {
  id: string;
  symbol: string;
  strategy: string;
  direction: 'BUY' | 'SELL';
  signalBarIndex: number;
  signalTime: number;
  signalTimeISO: string;
  calculatedEntry: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit2?: number;
  confidenceScore: number;
  riskReward: number;
  marketRegime: string;
  volatilityState: string;
  supportingStrategies: string[];
  sampleType: 'IN_SAMPLE' | 'OUT_OF_SAMPLE';
}

/**
 * Simulates a trade forward candle-by-candle until Stop Loss, Take Profit,
 * or end of data stream is reached.
 *
 * Rules:
 * - Trade entry executed on the OPEN of candle N+1 (signalBarIndex + 1).
 * - Exact SL and TP are used.
 * - Same-candle conflict handled conservatively by default (marked as LOSS).
 * - 1R = |entryPrice - stopLoss|
 */
export function simulateTradeOutcome(
  setup: PendingTradeSetup,
  allCandles: MarketCandle[],
  config: BacktestConfig
): BacktestTrade | null {
  const entryIndex = setup.signalBarIndex + 1;
  if (entryIndex >= allCandles.length) {
    // Cannot execute if signal was on the very last candle
    return null;
  }

  const entryCandle = allCandles[entryIndex];
  let entryPrice = entryCandle.open;
  const entryTime = entryCandle.time || entryCandle.timestamp || 0;
  const entryTimeISO = new Date(entryTime).toISOString();

  // Apply Cost Model on entry if enabled
  let costImpactInPoints = 0;
  if (config.costModel.enabled) {
    const spreadPoints = config.costModel.spreadPips;
    const slippagePoints = config.costModel.slippagePips;
    costImpactInPoints = spreadPoints + slippagePoints;

    if (setup.direction === 'BUY') {
      entryPrice += slippagePoints + spreadPoints * 0.5;
    } else {
      entryPrice -= slippagePoints + spreadPoints * 0.5;
    }
  }

  const stopLoss = setup.stopLoss;
  const takeProfit = setup.takeProfit;

  // 1R risk baseline
  let raw1R = setup.direction === 'BUY' ? entryPrice - stopLoss : stopLoss - entryPrice;
  if (raw1R <= 0) {
    // Sanity fallback: if entry slipped past SL, normalize to at least 1 pip distance
    raw1R = Math.max(0.0001, entryPrice * 0.001);
  }

  let exitBarIndex = entryIndex;
  let exitTime = entryTime;
  let exitPrice = entryPrice;
  let exitReason: ExitReason = 'IN_PROGRESS';
  let result: TradeResultType = 'LOSS';
  let exitAmbiguity = false;
  let resolved = false;

  const conflictRule: ExitConflictRule = config.exitConflictRule || 'CONSERVATIVE';

  // Step through future candles starting from entry candle
  for (let i = entryIndex; i < allCandles.length; i++) {
    const candle = allCandles[i];
    exitBarIndex = i;
    exitTime = candle.time || candle.timestamp || 0;

    if (setup.direction === 'BUY') {
      const hitTP = candle.high >= takeProfit;
      const hitSL = candle.low <= stopLoss;

      if (hitTP && hitSL) {
        // Same-candle conflict
        exitAmbiguity = true;
        if (conflictRule === 'CONSERVATIVE' || conflictRule === 'STOP_FIRST') {
          exitPrice = stopLoss;
          exitReason = 'SAME_CANDLE_CONFLICT_LOSS';
          result = 'AMBIGUOUS';
        } else {
          exitPrice = takeProfit;
          exitReason = 'SAME_CANDLE_CONFLICT_WIN';
          result = 'WIN';
        }
        resolved = true;
        break;
      } else if (hitSL) {
        exitPrice = stopLoss;
        exitReason = 'STOP_LOSS';
        result = 'LOSS';
        resolved = true;
        break;
      } else if (hitTP) {
        exitPrice = takeProfit;
        exitReason = 'TAKE_PROFIT';
        result = 'WIN';
        resolved = true;
        break;
      }
    } else {
      // SELL trade
      const hitTP = candle.low <= takeProfit;
      const hitSL = candle.high >= stopLoss;

      if (hitTP && hitSL) {
        // Same-candle conflict
        exitAmbiguity = true;
        if (conflictRule === 'CONSERVATIVE' || conflictRule === 'STOP_FIRST') {
          exitPrice = stopLoss;
          exitReason = 'SAME_CANDLE_CONFLICT_LOSS';
          result = 'AMBIGUOUS';
        } else {
          exitPrice = takeProfit;
          exitReason = 'SAME_CANDLE_CONFLICT_WIN';
          result = 'WIN';
        }
        resolved = true;
        break;
      } else if (hitSL) {
        exitPrice = stopLoss;
        exitReason = 'STOP_LOSS';
        result = 'LOSS';
        resolved = true;
        break;
      } else if (hitTP) {
        exitPrice = takeProfit;
        exitReason = 'TAKE_PROFIT';
        result = 'WIN';
        resolved = true;
        break;
      }
    }
  }

  // If trade reached end of candle stream without hitting SL/TP, mark as expired at last close
  if (!resolved) {
    const lastCandle = allCandles[allCandles.length - 1];
    exitBarIndex = allCandles.length - 1;
    exitTime = lastCandle.time || lastCandle.timestamp || 0;
    exitPrice = lastCandle.close;
    exitReason = 'MAX_BARS_EXPIRED';

    const pnl = setup.direction === 'BUY' ? exitPrice - entryPrice : entryPrice - exitPrice;
    if (Math.abs(pnl) < raw1R * 0.1) {
      result = 'BREAKEVEN';
    } else if (pnl > 0) {
      result = 'WIN';
    } else {
      result = 'LOSS';
    }
  }

  // Calculate Gross R
  let grossPoints = setup.direction === 'BUY' ? exitPrice - entryPrice : entryPrice - exitPrice;
  let grossR = Number((grossPoints / raw1R).toFixed(3));

  // Commission & Friction in R
  let costImpactR = 0;
  if (config.costModel.enabled) {
    const frictionR = costImpactInPoints / raw1R;
    const commissionR = config.costModel.commissionR || 0;
    costImpactR = Number((frictionR + commissionR).toFixed(3));
  }

  const netR = Number((grossR - costImpactR).toFixed(3));

  // Standardize final result
  if (result !== 'AMBIGUOUS') {
    if (netR > 0.1) {
      result = 'WIN';
    } else if (netR < -0.1) {
      result = 'LOSS';
    } else {
      result = 'BREAKEVEN';
    }
  }

  const durationMs = exitTime - entryTime;
  const durationBars = Math.max(1, exitBarIndex - entryIndex + 1);

  return {
    id: setup.id,
    symbol: setup.symbol,
    strategy: setup.strategy,
    direction: setup.direction,
    signalTime: setup.signalTime,
    signalTimeISO: setup.signalTimeISO,
    entryTime,
    entryTimeISO,
    entryPrice: Number(entryPrice.toFixed(5)),
    stopLoss: Number(stopLoss.toFixed(5)),
    takeProfit: Number(takeProfit.toFixed(5)),
    takeProfit2: setup.takeProfit2 ? Number(setup.takeProfit2.toFixed(5)) : undefined,
    confidenceScore: setup.confidenceScore,
    riskReward: setup.riskReward,
    exitTime,
    exitTimeISO: new Date(exitTime).toISOString(),
    exitPrice: Number(exitPrice.toFixed(5)),
    exitReason,
    result,
    grossR,
    netR,
    RMultiple: netR,
    durationMs,
    durationBars,
    marketRegime: setup.marketRegime,
    volatilityState: setup.volatilityState,
    newsRisk: 'UNKNOWN',
    exitAmbiguity,
    supportingStrategies: setup.supportingStrategies,
    costImpactR,
    sampleType: setup.sampleType,
    entryBarIndex: entryIndex,
    exitBarIndex,
  };
}
