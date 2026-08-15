import { MarketCandle, IndicatorData, PriceZone, LiquiditySweep, MarketStructure, MarketBias } from '../types';

export function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(data[i]);
      continue;
    }
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let prevEMA = data[0] || 0;

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[0]);
      prevEMA = data[0];
    } else {
      const currentEMA = data[i] * k + prevEMA * (1 - k);
      result.push(currentEMA);
      prevEMA = currentEMA;
    }
  }
  return result;
}

export function calculateRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = [];
  if (closes.length === 0) return rsi;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period && i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      rsi.push(50);
      continue;
    }

    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }

  return rsi;
}

export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  const macdLine = closes.map((_, i) => fastEMA[i] - slowEMA[i]);
  const signalLine = calculateEMA(macdLine, signalPeriod);
  const histogram = macdLine.map((val, i) => val - signalLine[i]);

  return { macdLine, signalLine, histogram };
}

export function calculateATR(candles: MarketCandle[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
      continue;
    }
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    const prevClose = candles[i - 1].close;

    const trVal = Math.max(
      currentHigh - currentLow,
      Math.abs(currentHigh - prevClose),
      Math.abs(currentLow - prevClose)
    );
    tr.push(trVal);
  }

  return calculateEMA(tr, period);
}

export function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2
): { upper: number[]; middle: number[]; lower: number[]; bandwidth: number[] } {
  const middle = calculateSMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(middle[i]);
      lower.push(middle[i]);
      bandwidth.push(0);
      continue;
    }

    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const up = mean + stdDev * stdDevMultiplier;
    const low = mean - stdDev * stdDevMultiplier;
    upper.push(up);
    lower.push(low);
    bandwidth.push(mean > 0 ? ((up - low) / mean) * 100 : 0);
  }

  return { upper, middle, lower, bandwidth };
}

export function calculatePivotPoints(candles: MarketCandle[]) {
  if (candles.length === 0) {
    return { pp: 0, r1: 0, s1: 0, r2: 0, s2: 0, r3: 0, s3: 0 };
  }

  // Use recent range or last completed period
  const lookback = Math.min(candles.length, 24);
  const recent = candles.slice(-lookback);
  const high = Math.max(...recent.map((c) => c.high));
  const low = Math.min(...recent.map((c) => c.low));
  const close = recent[recent.length - 1].close;

  const pp = (high + low + close) / 3;
  const r1 = 2 * pp - low;
  const s1 = 2 * pp - high;
  const r2 = pp + (high - low);
  const s2 = pp - (high - low);
  const r3 = high + 2 * (pp - low);
  const s3 = low - 2 * (high - pp);

  return { pp, r1, s1, r2, s2, r3, s3 };
}

export function findSwingPoints(
  candles: MarketCandle[],
  leftBars = 3,
  rightBars = 3
): {
  swingHighs: { index: number; price: number; time: number }[];
  swingLows: { index: number; price: number; time: number }[];
} {
  const swingHighs: { index: number; price: number; time: number }[] = [];
  const swingLows: { index: number; price: number; time: number }[] = [];

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    let isHigh = true;
    let isLow = true;

    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].high >= currentHigh) isHigh = false;
      if (candles[j].low <= currentLow) isLow = false;
    }

    if (isHigh) {
      swingHighs.push({ index: i, price: currentHigh, time: candles[i].time });
    }
    if (isLow) {
      swingLows.push({ index: i, price: currentLow, time: candles[i].time });
    }
  }

  return { swingHighs, swingLows };
}

export function computeIndicators(candles: MarketCandle[]): IndicatorData {
  const closes = candles.map((c) => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);
  const atr = calculateATR(candles, 14);
  const bollingerBands = calculateBollingerBands(closes);
  const pivotPoints = calculatePivotPoints(candles);
  const { swingHighs, swingLows } = findSwingPoints(candles);

  return {
    ema20,
    ema50,
    ema200,
    rsi,
    macd,
    atr,
    bollingerBands,
    pivotPoints,
    swingHighs,
    swingLows,
  };
}

export function detectSupportResistance(
  candles: MarketCandle[],
  swingHighs: { price: number }[],
  swingLows: { price: number }[],
  pipThreshold = 0.0015
): PriceZone[] {
  const zones: PriceZone[] = [];
  const allPoints = [
    ...swingHighs.map((s) => ({ price: s.price, type: 'RESISTANCE' as const })),
    ...swingLows.map((s) => ({ price: s.price, type: 'SUPPORT' as const })),
  ];

  if (allPoints.length === 0) return zones;

  // Cluster nearby swing points
  allPoints.sort((a, b) => a.price - b.price);

  let currentCluster: { price: number; type: 'SUPPORT' | 'RESISTANCE' }[] = [allPoints[0]];

  for (let i = 1; i < allPoints.length; i++) {
    const diff = allPoints[i].price - allPoints[i - 1].price;
    const avgPrice = (allPoints[i].price + allPoints[i - 1].price) / 2;
    const relativeDiff = avgPrice > 0 ? diff / avgPrice : 0;

    if (relativeDiff < pipThreshold) {
      currentCluster.push(allPoints[i]);
    } else {
      if (currentCluster.length >= 2) {
        const prices = currentCluster.map((p) => p.price);
        const topPrice = Math.max(...prices);
        const bottomPrice = Math.min(...prices);
        const touchCount = currentCluster.length;
        const resCount = currentCluster.filter((c) => c.type === 'RESISTANCE').length;
        const supCount = currentCluster.filter((c) => c.type === 'SUPPORT').length;

        zones.push({
          type: resCount > supCount ? 'RESISTANCE' : 'SUPPORT',
          topPrice: topPrice * 1.0005,
          bottomPrice: bottomPrice * 0.9995,
          touches: touchCount,
          strength: Math.min(10, touchCount * 2),
        });
      }
      currentCluster = [allPoints[i]];
    }
  }

  return zones.slice(-6); // Keep key recent zones
}

export function analyzeMarketStructure(candles: MarketCandle[]): MarketStructure {
  if (candles.length < 20) {
    return {
      trend: 'NEUTRAL',
      higherHighs: false,
      higherLows: false,
      lowerHighs: false,
      lowerLows: false,
      lastBOS: null,
      lastCHoCH: null,
      supportResistanceZones: [],
      liquiditySweeps: [],
      volatilityState: 'NORMAL',
      momentumState: 'NEUTRAL',
    };
  }

  const { swingHighs, swingLows } = findSwingPoints(candles, 2, 2);
  const zones = detectSupportResistance(candles, swingHighs, swingLows);

  // Evaluate HH/HL or LH/LL
  let higherHighs = false;
  let higherLows = false;
  let lowerHighs = false;
  let lowerLows = false;

  if (swingHighs.length >= 2) {
    const lastHigh = swingHighs[swingHighs.length - 1].price;
    const prevHigh = swingHighs[swingHighs.length - 2].price;
    higherHighs = lastHigh > prevHigh;
    lowerHighs = lastHigh < prevHigh;
  }

  if (swingLows.length >= 2) {
    const lastLow = swingLows[swingLows.length - 1].price;
    const prevLow = swingLows[swingLows.length - 2].price;
    higherLows = lastLow > prevLow;
    lowerLows = lastLow < prevLow;
  }

  let trend: MarketBias = 'NEUTRAL';
  if (higherHighs && higherLows) trend = 'BULLISH';
  else if (lowerHighs && lowerLows) trend = 'BEARISH';
  else if (higherHighs) trend = 'BULLISH';
  else if (lowerLows) trend = 'BEARISH';

  // Detect BOS and CHoCH
  let lastBOS: MarketStructure['lastBOS'] = null;
  let lastCHoCH: MarketStructure['lastCHoCH'] = null;
  const currentPrice = candles[candles.length - 1].close;

  if (swingHighs.length >= 2 && currentPrice > swingHighs[swingHighs.length - 1].price) {
    if (trend === 'BULLISH') {
      lastBOS = {
        type: 'BULLISH',
        price: swingHighs[swingHighs.length - 1].price,
        time: candles[candles.length - 1].time,
      };
    } else {
      lastCHoCH = {
        type: 'BULLISH',
        price: swingHighs[swingHighs.length - 1].price,
        time: candles[candles.length - 1].time,
      };
    }
  } else if (swingLows.length >= 2 && currentPrice < swingLows[swingLows.length - 1].price) {
    if (trend === 'BEARISH') {
      lastBOS = {
        type: 'BEARISH',
        price: swingLows[swingLows.length - 1].price,
        time: candles[candles.length - 1].time,
      };
    } else {
      lastCHoCH = {
        type: 'BEARISH',
        price: swingLows[swingLows.length - 1].price,
        time: candles[candles.length - 1].time,
      };
    }
  }

  // Detect Liquidity Sweeps (Wick breaks key swing high/low then closes back inside)
  const liquiditySweeps: LiquiditySweep[] = [];
  const recentCandles = candles.slice(-10);

  for (const candle of recentCandles) {
    for (const sh of swingHighs.slice(-4)) {
      if (candle.high > sh.price && candle.close < sh.price) {
        liquiditySweeps.push({
          type: 'SWEEP_HIGHS',
          price: candle.high,
          time: candle.time,
          reversalConfirmed: candle.close < candle.open,
          significance: 'HIGH',
        });
      }
    }

    for (const sl of swingLows.slice(-4)) {
      if (candle.low < sl.price && candle.close > sl.price) {
        liquiditySweeps.push({
          type: 'SWEEP_LOWS',
          price: candle.low,
          time: candle.time,
          reversalConfirmed: candle.close > candle.open,
          significance: 'HIGH',
        });
      }
    }
  }

  // Volatility State from ATR & Bollinger Bandwidth
  const closes = candles.map((c) => c.close);
  const bb = calculateBollingerBands(closes);
  const lastBandwidth = bb.bandwidth[bb.bandwidth.length - 1] || 0;
  const avgBandwidth = bb.bandwidth.slice(-20).reduce((a, b) => a + b, 0) / 20;

  let volatilityState: MarketStructure['volatilityState'] = 'NORMAL';
  if (lastBandwidth > avgBandwidth * 1.4) volatilityState = 'EXPANDING';
  else if (lastBandwidth < avgBandwidth * 0.7) volatilityState = 'COMPRESSING';

  // Momentum State from RSI & MACD
  const rsi = calculateRSI(closes);
  const lastRsi = rsi[rsi.length - 1] || 50;
  const macd = calculateMACD(closes);
  const lastHist = macd.histogram[macd.histogram.length - 1] || 0;

  let momentumState: MarketStructure['momentumState'] = 'NEUTRAL';
  if (lastRsi > 65 && lastHist > 0) momentumState = 'STRONG_BULLISH';
  else if (lastRsi > 52 && lastHist >= 0) momentumState = 'BULLISH';
  else if (lastRsi < 35 && lastHist < 0) momentumState = 'STRONG_BEARISH';
  else if (lastRsi < 48 && lastHist <= 0) momentumState = 'BEARISH';

  return {
    trend,
    higherHighs,
    higherLows,
    lowerHighs,
    lowerLows,
    lastBOS,
    lastCHoCH,
    supportResistanceZones: zones,
    liquiditySweeps: liquiditySweeps.slice(-3),
    volatilityState,
    momentumState,
  };
}
