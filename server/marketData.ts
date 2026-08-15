import { MarketCandle, MarketQuote, Timeframe, InstrumentConfig, MarketPrice } from '../src/types';
import { SUPPORTED_ASSETS, getAssetConfig, normalizeSymbolKey, getAssetMarketStatus } from './config/assets';
import { marketDataManager } from './providers/MarketDataManager';

export const SUPPORTED_INSTRUMENTS: Record<string, InstrumentConfig> = {};

// Populate SUPPORTED_INSTRUMENTS from central asset catalog
for (const asset of SUPPORTED_ASSETS) {
  const normKey = asset.symbol.replace('/', '');
  const configItem: InstrumentConfig = {
    symbol: asset.symbol,
    name: asset.displayName,
    displayName: asset.displayName,
    assetClass: asset.assetClass,
    providerSymbol: asset.providerSymbol,
    exchange: asset.exchange,
    enabled: asset.enabled,
    supportedTimeframes: asset.supportedTimeframes,
    provider: asset.provider,
    pipSize: asset.pipSize,
    digits: asset.digits,
    icon: asset.icon,
    description: asset.description,
  };

  SUPPORTED_INSTRUMENTS[asset.symbol] = configItem;
  SUPPORTED_INSTRUMENTS[normKey] = configItem;
}

export { marketDataManager } from './providers/MarketDataManager';
export { SUPPORTED_ASSETS, getAssetConfig, normalizeSymbolKey } from './config/assets';

export function getMarketSessionStatus(symbol: string): 'OPEN' | 'CLOSED' | 'WEEKEND' {
  const asset = getAssetConfig(symbol);
  return getAssetMarketStatus(asset?.assetClass || 'FOREX');
}

/**
 * Historical candles generator for development simulation only (strictly marked as test data)
 */
export function generateTestCandles(
  basePrice: number,
  timeframe: Timeframe,
  count = 100,
  volatility = 0.002
): MarketCandle[] {
  const candles: MarketCandle[] = [];
  const now = Date.now();
  const tfMs =
    timeframe === 'M5'
      ? 5 * 60 * 1000
      : timeframe === 'M15'
      ? 15 * 60 * 1000
      : timeframe === 'H1'
      ? 60 * 60 * 1000
      : timeframe === 'H4'
      ? 4 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

  let currentClose = basePrice;

  for (let i = count - 1; i >= 0; i--) {
    const candleTime = now - i * tfMs;
    const change = (Math.random() - 0.49) * volatility * currentClose;
    const open = currentClose;
    const close = Math.max(0.0001, open + change);
    const wick1 = Math.random() * volatility * 0.8 * currentClose;
    const wick2 = Math.random() * volatility * 0.8 * currentClose;
    const high = Math.max(open, close) + wick1;
    const low = Math.min(open, close) - wick2;
    const volume = Math.floor(1000 + Math.random() * 8000);

    candles.push({
      time: candleTime,
      open,
      high,
      low,
      close,
      volume,
      source: 'Test Data (Development)',
    });
    currentClose = close;
  }

  return candles;
}

interface MarketDataPayload {
  quote: MarketQuote;
  candles: Record<Timeframe, MarketCandle[]>;
  dataSource: string;
  isTest?: boolean;
}

/**
 * Authoritative market data fetcher with real Twelve Data provider integration
 */
export async function fetchLiveMarketData(
  symbol: string,
  requestedTimeframes: Timeframe[] = ['M15', 'H1']
): Promise<MarketDataPayload> {
  const asset = getAssetConfig(symbol);
  const normalizedSym = asset ? asset.symbol : normalizeSymbolKey(symbol);

  // 1. Fetch real price quote from Twelve Data provider
  const priceQuote: MarketPrice = await marketDataManager.getQuote(normalizedSym);

  const marketQuote: MarketQuote = {
    symbol: priceQuote.symbol,
    price: priceQuote.price,
    bid: priceQuote.bid || priceQuote.price * 0.9999,
    ask: priceQuote.ask || priceQuote.price * 1.0001,
    high24h: priceQuote.high24h,
    low24h: priceQuote.low24h,
    change24h: priceQuote.change24h,
    changePercent24h: priceQuote.changePercent24h,
    timestamp: priceQuote.timestamp,
    marketStatus: priceQuote.marketStatus,
    dataSource: priceQuote.dataSource,
    status: priceQuote.status,
    errorMessage: priceQuote.errorMessage,
  };

  // 2. Fetch real candles for requested timeframes if available
  const candles: Record<Timeframe, MarketCandle[]> = {
    M5: [],
    M15: [],
    H1: [],
    H4: [],
    D1: [],
  };

  if (priceQuote.status !== 'UNAVAILABLE' && priceQuote.price > 0) {
    try {
      const tfList: Timeframe[] = Array.from(new Set<Timeframe>([...requestedTimeframes, 'M15']));
      for (const tf of tfList) {
        try {
          const res = await marketDataManager.getHistoricalCandles(normalizedSym, tf, 60);
          if (res.candles && res.candles.length >= 5) {
            candles[tf] = res.candles;
          }
        } catch (tfErr) {
          console.warn(`[marketData] Could not fetch ${tf} for ${normalizedSym}:`, tfErr);
        }
      }
    } catch (err) {
      console.warn(`[marketData] Non-blocking candle fetch error for ${normalizedSym}:`, err);
    }
  }

  // If candles are not returned from provider, do not fabricate fake candles.
  // Return empty array and accurately indicate provider state.
  return {
    quote: marketQuote,
    candles,
    dataSource: priceQuote.dataSource,
    isTest: false,
  };
}
