import { MarketDataProvider } from './MarketDataProvider';
import {
  Asset,
  MarketPrice,
  MarketCandle,
  Timeframe,
  ProviderStatusInfo,
  MarketDataStatus,
} from '../../src/types';
import { getAssetMarketStatus } from '../config/assets';
import { validateMarketCandles } from '../validation/marketDataValidator';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

export class FinnhubProvider implements MarketDataProvider {
  public readonly name = 'Finnhub';
  private baseUrl = 'https://finnhub.io/api/v1';

  // In-memory caching
  private quoteCache = new Map<string, CacheEntry<MarketPrice>>();
  private candleCache = new Map<string, CacheEntry<MarketCandle[]>>();

  // In-flight request deduplication
  private inFlightQuotes = new Map<string, Promise<MarketPrice>>();
  private inFlightCandles = new Map<string, Promise<MarketCandle[]>>();

  // Rate limit tracking (Finnhub Free: 30-60 req/min)
  private requestTimestamps: number[] = [];
  private dailyRequestCount = 0;
  private dailyResetTime = Date.now() + 24 * 3600 * 1000;
  private isRateLimited = false;
  private rateLimitCooldownUntil = 0;
  private readonly MINUTE_LIMIT = 30;
  private readonly DAILY_LIMIT = 1000;

  // Diagnostics
  private lastSuccessTime = 0;
  private lastErrorMessage = '';
  private lastCheckedTime = 0;

  constructor() {}

  private getApiKey(): string {
    return (process.env.FINNHUB_API_KEY || '').trim();
  }

  public get isConfigured(): boolean {
    const key = this.getApiKey();
    return Boolean(key && key.length > 5);
  }

  /**
   * Checks rate limit constraints before dispatching HTTP calls.
   */
  private checkRateLimit(): { allowed: boolean; reason?: string } {
    const now = Date.now();

    if (now > this.dailyResetTime) {
      this.dailyRequestCount = 0;
      this.dailyResetTime = now + 24 * 3600 * 1000;
    }

    if (this.isRateLimited && now < this.rateLimitCooldownUntil) {
      const waitSec = Math.ceil((this.rateLimitCooldownUntil - now) / 1000);
      return {
        allowed: false,
        reason: `Finnhub rate limit cooldown active (${waitSec}s remaining).`,
      };
    } else if (this.isRateLimited && now >= this.rateLimitCooldownUntil) {
      this.isRateLimited = false;
    }

    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60000);

    if (this.requestTimestamps.length >= this.MINUTE_LIMIT) {
      return {
        allowed: false,
        reason: 'Finnhub rate limit reached (30 req/min). Using cache.',
      };
    }

    if (this.dailyRequestCount >= this.DAILY_LIMIT) {
      return {
        allowed: false,
        reason: 'Finnhub daily limit reached.',
      };
    }

    return { allowed: true };
  }

  private registerRequest(): void {
    const now = Date.now();
    this.requestTimestamps.push(now);
    this.dailyRequestCount++;
    this.lastCheckedTime = now;
  }

  private handleRateLimitHit(message?: string): void {
    this.isRateLimited = true;
    this.rateLimitCooldownUntil = Date.now() + 60 * 1000;
    this.lastErrorMessage = message || 'HTTP 429 Rate Limit Exceeded';
    console.warn(`[FinnhubProvider] Rate limit hit: ${this.lastErrorMessage}. Cooldown for 60s.`);
  }

  /**
   * Resolves the appropriate Finnhub symbol & API endpoint type for an asset.
   */
  private resolveFinnhubSymbol(asset: Asset): {
    symbol: string;
    endpointType: 'forex' | 'crypto' | 'stock';
    fallbackSymbol?: string;
  } {
    const cleanSym = asset.symbol.toUpperCase().replace(/[-_]/g, '/');

    switch (cleanSym) {
      // Forex
      case 'EUR/USD':
        return { symbol: 'OANDA:EUR_USD', endpointType: 'forex', fallbackSymbol: 'FX:EURUSD' };
      case 'GBP/USD':
        return { symbol: 'OANDA:GBP_USD', endpointType: 'forex', fallbackSymbol: 'FX:GBPUSD' };
      case 'USD/JPY':
        return { symbol: 'OANDA:USD_JPY', endpointType: 'forex', fallbackSymbol: 'FX:USDJPY' };
      case 'AUD/USD':
        return { symbol: 'OANDA:AUD_USD', endpointType: 'forex', fallbackSymbol: 'FX:AUDUSD' };

      // Crypto
      case 'BTC/USD':
        return { symbol: 'BINANCE:BTCUSDT', endpointType: 'crypto', fallbackSymbol: 'COINBASE:BTC-USD' };
      case 'ETH/USD':
        return { symbol: 'BINANCE:ETHUSDT', endpointType: 'crypto', fallbackSymbol: 'COINBASE:ETH-USD' };
      case 'SOL/USD':
        return { symbol: 'BINANCE:SOLUSDT', endpointType: 'crypto', fallbackSymbol: 'COINBASE:SOL-USD' };

      // Commodities (Gold / Silver)
      case 'XAU/USD':
        return { symbol: 'OANDA:XAU_USD', endpointType: 'forex', fallbackSymbol: 'GLD' };
      case 'XAG/USD':
        return { symbol: 'OANDA:XAG_USD', endpointType: 'forex', fallbackSymbol: 'SLV' };

      // Indices
      case 'NAS100':
        return { symbol: 'QQQ', endpointType: 'stock' };
      case 'SPX500':
        return { symbol: 'SPY', endpointType: 'stock' };
      case 'US30':
        return { symbol: 'DIA', endpointType: 'stock' };

      default:
        if (asset.assetClass === 'FOREX') {
          const formatted = cleanSym.replace('/', '_');
          return { symbol: `OANDA:${formatted}`, endpointType: 'forex' };
        }
        if (asset.assetClass === 'CRYPTO') {
          const formatted = cleanSym.replace('/', '');
          return { symbol: `BINANCE:${formatted}T`, endpointType: 'crypto' };
        }
        return { symbol: asset.providerSymbol || cleanSym, endpointType: 'stock' };
    }
  }

  /**
   * Translates internal Timeframe to Finnhub resolution string.
   */
  private formatResolution(tf: Timeframe): string {
    switch (tf) {
      case 'M5':
        return '5';
      case 'M15':
        return '15';
      case 'H1':
        return '60';
      case 'H4':
        return '60'; // Finnhub candle resolutions: 1, 5, 15, 30, 60, D, W, M
      case 'D1':
        return 'D';
      default:
        return '15';
    }
  }

  /**
   * Retrieves real-time quote from Finnhub with caching and deduplication.
   */
  public async getQuote(asset: Asset): Promise<MarketPrice> {
    const cacheKey = `finnhub_quote_${asset.symbol}`;
    const cached = this.quoteCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < cached.ttlMs) {
      return cached.data;
    }

    if (this.inFlightQuotes.has(cacheKey)) {
      return this.inFlightQuotes.get(cacheKey)!;
    }

    const fetchPromise = this.fetchQuoteInternal(asset, cached?.data);
    this.inFlightQuotes.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      if (result.price > 0 && result.status !== 'ERROR' && result.status !== 'UNAVAILABLE') {
        this.quoteCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          ttlMs: 30000,
        });
        this.lastSuccessTime = Date.now();
      }
      return result;
    } finally {
      this.inFlightQuotes.delete(cacheKey);
    }
  }

  private async fetchQuoteInternal(
    asset: Asset,
    previousQuote?: MarketPrice
  ): Promise<MarketPrice> {
    const marketStatus = getAssetMarketStatus(asset.assetClass);
    const apiKey = this.getApiKey();

    if (!this.isConfigured) {
      return {
        symbol: asset.symbol,
        displayName: asset.displayName,
        assetClass: asset.assetClass,
        price: 0,
        high24h: 0,
        low24h: 0,
        change24h: 0,
        changePercent24h: 0,
        timestamp: Date.now(),
        lastUpdate: new Date().toISOString(),
        marketStatus,
        dataSource: 'Finnhub (Unconfigured)',
        status: 'UNCONFIGURED' as any,
        errorMessage: 'FINNHUB_API_KEY is not configured',
      };
    }

    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      if (previousQuote && previousQuote.price > 0) {
        return {
          ...previousQuote,
          status: 'STALE',
          dataSource: 'Finnhub (Cached - Rate Limit)',
          errorMessage: rateCheck.reason,
        };
      }
      return {
        symbol: asset.symbol,
        displayName: asset.displayName,
        assetClass: asset.assetClass,
        price: 0,
        high24h: 0,
        low24h: 0,
        change24h: 0,
        changePercent24h: 0,
        timestamp: Date.now(),
        lastUpdate: new Date().toISOString(),
        marketStatus,
        dataSource: 'Finnhub',
        status: 'RATE_LIMITED',
        errorMessage: rateCheck.reason || 'Finnhub rate limit reached.',
      };
    }

    try {
      this.registerRequest();
      const resolved = this.resolveFinnhubSymbol(asset);

      // Finnhub quote endpoint: GET /api/v1/quote?symbol=...&token=...
      const url = `${this.baseUrl}/quote?symbol=${encodeURIComponent(
        resolved.symbol
      )}&token=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

      if (res.status === 429) {
        this.handleRateLimitHit('HTTP 429 Too Many Requests');
        if (previousQuote && previousQuote.price > 0) {
          return {
            ...previousQuote,
            status: 'STALE',
            dataSource: 'Finnhub (Cached - Rate Limited)',
            errorMessage: 'Finnhub API limit reached',
          };
        }
        return {
          symbol: asset.symbol,
          displayName: asset.displayName,
          assetClass: asset.assetClass,
          price: 0,
          high24h: 0,
          low24h: 0,
          change24h: 0,
          changePercent24h: 0,
          timestamp: Date.now(),
          lastUpdate: new Date().toISOString(),
          marketStatus,
          dataSource: 'Finnhub',
          status: 'RATE_LIMITED',
          errorMessage: 'Finnhub API limit reached',
        };
      }

      if (res.status === 403 || res.status === 401) {
        const msg = `Finnhub returned ${res.status}: Plan restriction or invalid credentials.`;
        this.lastErrorMessage = msg;
        return {
          symbol: asset.symbol,
          displayName: asset.displayName,
          assetClass: asset.assetClass,
          price: 0,
          high24h: 0,
          low24h: 0,
          change24h: 0,
          changePercent24h: 0,
          timestamp: Date.now(),
          lastUpdate: new Date().toISOString(),
          marketStatus,
          dataSource: 'Finnhub',
          status: 'UNAVAILABLE',
          errorMessage: 'UNAVAILABLE FROM FINNHUB CURRENT PLAN',
        };
      }

      if (!res.ok) {
        throw new Error(`Finnhub quote returned HTTP ${res.status}`);
      }

      const data = await res.json();

      // Finnhub standard quote response format:
      // { c: currentPrice, d: change, dp: percentChange, h: high, l: low, o: open, pc: prevClose, t: timestamp }
      const price = typeof data.c === 'number' ? data.c : 0;
      const high24h = typeof data.h === 'number' ? data.h : price;
      const low24h = typeof data.l === 'number' ? data.l : price;
      const change = typeof data.d === 'number' ? data.d : 0;
      const changePercent = typeof data.dp === 'number' ? data.dp : 0;
      const timestamp = (typeof data.t === 'number' && data.t > 0 ? data.t * 1000 : Date.now());

      // If price is 0 or all fields are 0, Finnhub didn't find data for this symbol
      if (price <= 0) {
        // If it's a forex or commodity pair, try fetching the last candle close as fallback
        const candleFallback = await this.fetchCandleQuoteFallback(asset, resolved, apiKey);
        if (candleFallback) {
          return candleFallback;
        }

        return {
          symbol: asset.symbol,
          displayName: asset.displayName,
          assetClass: asset.assetClass,
          price: 0,
          high24h: 0,
          low24h: 0,
          change24h: 0,
          changePercent24h: 0,
          timestamp: Date.now(),
          lastUpdate: new Date().toISOString(),
          marketStatus,
          dataSource: 'Finnhub',
          status: 'UNAVAILABLE',
          errorMessage: `No market quote returned from Finnhub for ${resolved.symbol}`,
        };
      }

      const quoteResult: MarketPrice = {
        symbol: asset.symbol,
        displayName: asset.displayName,
        assetClass: asset.assetClass,
        price,
        high24h,
        low24h,
        change24h: change,
        changePercent24h: changePercent,
        timestamp,
        lastUpdate: new Date(timestamp).toISOString(),
        marketStatus,
        dataSource: 'Finnhub',
        status: 'LIVE',
      };

      return quoteResult;
    } catch (err: any) {
      this.lastErrorMessage = err.message || 'Finnhub quote network failure';
      if (previousQuote && previousQuote.price > 0) {
        return {
          ...previousQuote,
          status: 'STALE',
          dataSource: 'Finnhub (Cached - Network Failure)',
          errorMessage: this.lastErrorMessage,
        };
      }
      return {
        symbol: asset.symbol,
        displayName: asset.displayName,
        assetClass: asset.assetClass,
        price: 0,
        high24h: 0,
        low24h: 0,
        change24h: 0,
        changePercent24h: 0,
        timestamp: Date.now(),
        lastUpdate: new Date().toISOString(),
        marketStatus,
        dataSource: 'Finnhub',
        status: 'ERROR',
        errorMessage: this.lastErrorMessage,
      };
    }
  }

  /**
   * Fallback for Forex/Commodities where /quote may not return values but /forex/candle or /crypto/candle has recent data.
   */
  private async fetchCandleQuoteFallback(
    asset: Asset,
    resolved: { symbol: string; endpointType: 'forex' | 'crypto' | 'stock'; fallbackSymbol?: string },
    apiKey: string
  ): Promise<MarketPrice | null> {
    try {
      const endpoint =
        resolved.endpointType === 'forex'
          ? 'forex/candle'
          : resolved.endpointType === 'crypto'
          ? 'crypto/candle'
          : 'stock/candle';

      const to = Math.floor(Date.now() / 1000);
      const from = to - 86400 * 2; // Last 2 days

      const candleUrl = `${this.baseUrl}/${endpoint}?symbol=${encodeURIComponent(
        resolved.symbol
      )}&resolution=15&from=${from}&to=${to}&token=${encodeURIComponent(apiKey)}`;

      const res = await fetch(candleUrl, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;

      const data = await res.json();
      if (data.s === 'ok' && Array.isArray(data.c) && data.c.length > 0) {
        const lastIdx = data.c.length - 1;
        const price = data.c[lastIdx];
        const open = data.o[0] || price;
        const high24h = Math.max(...data.h);
        const low24h = Math.min(...data.l);
        const change = price - open;
        const changePercent = open > 0 ? (change / open) * 100 : 0;
        const timestamp = (data.t[lastIdx] || to) * 1000;

        return {
          symbol: asset.symbol,
          displayName: asset.displayName,
          assetClass: asset.assetClass,
          price,
          high24h,
          low24h,
          change24h: change,
          changePercent24h: changePercent,
          timestamp,
          lastUpdate: new Date(timestamp).toISOString(),
          marketStatus: getAssetMarketStatus(asset.assetClass),
          dataSource: 'Finnhub (Candle Series)',
          status: 'LIVE',
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves historical OHLCV candles from Finnhub.
   */
  public async getHistoricalCandles(
    asset: Asset,
    timeframe: Timeframe,
    numberOfCandles = 100
  ): Promise<MarketCandle[]> {
    const cacheKey = `finnhub_candles_${asset.symbol}_${timeframe}_${numberOfCandles}`;
    const cached = this.candleCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < cached.ttlMs) {
      return cached.data;
    }

    if (this.inFlightCandles.has(cacheKey)) {
      return this.inFlightCandles.get(cacheKey)!;
    }

    const fetchPromise = this.fetchCandlesInternal(asset, timeframe, numberOfCandles);
    this.inFlightCandles.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      if (result.length > 0) {
        this.candleCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          ttlMs: 30000,
        });
        this.lastSuccessTime = Date.now();
      }
      return result;
    } finally {
      this.inFlightCandles.delete(cacheKey);
    }
  }

  private async fetchCandlesInternal(
    asset: Asset,
    timeframe: Timeframe,
    numberOfCandles: number
  ): Promise<MarketCandle[]> {
    if (!this.isConfigured) {
      return [];
    }

    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      return [];
    }

    try {
      this.registerRequest();
      const apiKey = this.getApiKey();
      const resolved = this.resolveFinnhubSymbol(asset);
      const resolution = this.formatResolution(timeframe);

      const endpoint =
        resolved.endpointType === 'forex'
          ? 'forex/candle'
          : resolved.endpointType === 'crypto'
          ? 'crypto/candle'
          : 'stock/candle';

      const barSeconds =
        timeframe === 'M5'
          ? 300
          : timeframe === 'M15'
          ? 900
          : timeframe === 'H1' || timeframe === 'H4'
          ? 3600
          : 86400;

      const requestedBars = timeframe === 'H4' ? numberOfCandles * 4 : numberOfCandles;
      const to = Math.floor(Date.now() / 1000);
      // Multiply by 2.2 buffer to account for weekends / non-trading hours
      const from = to - Math.floor(requestedBars * barSeconds * 2.2);

      const url = `${this.baseUrl}/${endpoint}?symbol=${encodeURIComponent(
        resolved.symbol
      )}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${to}&token=${encodeURIComponent(
        apiKey
      )}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });

      if (res.status === 429) {
        this.handleRateLimitHit('Finnhub Candle Rate Limit (HTTP 429)');
        return [];
      }

      if (!res.ok) {
        throw new Error(`Finnhub candle endpoint returned HTTP ${res.status}`);
      }

      const data = await res.json();

      // Finnhub candle schema: { c: [], h: [], l: [], o: [], s: 'ok'|'no_data', t: [], v: [] }
      if (data.s !== 'ok' || !Array.isArray(data.t) || data.t.length === 0) {
        return [];
      }

      const rawCandles: MarketCandle[] = [];
      const len = data.t.length;

      for (let i = 0; i < len; i++) {
        const t = data.t[i] * 1000;
        const open = data.o[i];
        const high = data.h[i];
        const low = data.l[i];
        const close = data.c[i];
        const volume = data.v ? data.v[i] || 0 : 0;

        if (
          Number.isFinite(open) &&
          Number.isFinite(high) &&
          Number.isFinite(low) &&
          Number.isFinite(close) &&
          open > 0 &&
          close > 0
        ) {
          rawCandles.push({
            time: t,
            timestamp: t,
            datetime: new Date(t).toISOString(),
            open,
            high,
            low,
            close,
            volume,
            symbol: asset.symbol,
            timeframe,
            source: 'Finnhub',
          });
        }
      }

      // If H4 was requested and we fetched 60m candles, aggregate into 4H candles
      let finalCandles = rawCandles;
      if (timeframe === 'H4' && rawCandles.length > 0) {
        finalCandles = this.aggregateCandles(rawCandles, 4, 'H4', asset.symbol);
      }

      // Validate candle sequence
      const validated = validateMarketCandles(finalCandles, asset.assetClass, timeframe);
      return validated.cleanCandles.slice(-numberOfCandles);
    } catch (err: any) {
      this.lastErrorMessage = err.message || 'Finnhub candle fetch failed';
      console.warn(`[FinnhubProvider] Failed to fetch candles for ${asset.symbol}:`, err.message);
      return [];
    }
  }

  /**
   * Resamples / aggregates smaller timeframe candles into larger timeframe candles (e.g. 1H -> 4H).
   */
  private aggregateCandles(
    candles: MarketCandle[],
    factor: number,
    targetTf: Timeframe,
    symbol: string
  ): MarketCandle[] {
    const aggregated: MarketCandle[] = [];

    for (let i = 0; i < candles.length; i += factor) {
      const slice = candles.slice(i, i + factor);
      if (slice.length === 0) continue;

      const open = slice[0].open;
      const close = slice[slice.length - 1].close;
      const high = Math.max(...slice.map((c) => c.high));
      const low = Math.min(...slice.map((c) => c.low));
      const volume = slice.reduce((acc, c) => acc + (c.volume || 0), 0);
      const time = slice[0].time;

      aggregated.push({
        time,
        timestamp: time,
        datetime: new Date(time).toISOString(),
        open,
        high,
        low,
        close,
        volume,
        symbol,
        timeframe: targetTf,
        source: 'Finnhub (Aggregated)',
      });
    }

    return aggregated;
  }

  public async getProviderStatus(): Promise<ProviderStatusInfo> {
    const now = Date.now();
    const isConfigured = this.isConfigured;

    let status: 'ONLINE' | 'RATE_LIMITED' | 'DEGRADED' | 'UNCONFIGURED' | 'ERROR' = 'ONLINE';
    let message = 'Finnhub live secondary market data stream active';

    if (!isConfigured) {
      status = 'UNCONFIGURED';
      message = 'FINNHUB_API_KEY is not configured in environment.';
    } else if (this.isRateLimited) {
      status = 'RATE_LIMITED';
      message = `Finnhub rate limit active. Cooldown until ${new Date(
        this.rateLimitCooldownUntil
      ).toLocaleTimeString()}`;
    } else if (this.lastErrorMessage && now - this.lastCheckedTime < 60000) {
      status = 'DEGRADED';
      message = `Finnhub recent notice: ${this.lastErrorMessage}`;
    }

    return {
      provider: this.name,
      configured: isConfigured,
      status,
      message,
      lastChecked: this.lastCheckedTime || now,
      rateLimitStats: {
        minuteRequests: this.requestTimestamps.filter((t) => now - t < 60000).length,
        minuteLimit: this.MINUTE_LIMIT,
        dailyRequests: this.dailyRequestCount,
        dailyLimit: this.DAILY_LIMIT,
        isLimitReached: this.isRateLimited,
      },
    };
  }

  public async isSymbolSupported(asset: Asset): Promise<boolean> {
    const resolved = this.resolveFinnhubSymbol(asset);
    return Boolean(resolved.symbol);
  }
}
