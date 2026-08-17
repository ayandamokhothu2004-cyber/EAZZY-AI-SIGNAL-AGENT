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

export class TwelveDataProvider implements MarketDataProvider {
  public readonly name = 'Twelve Data';
  private apiKey: string;
  private baseUrl = 'https://api.twelvedata.com';

  // In-memory cache
  private quoteCache = new Map<string, CacheEntry<MarketPrice>>();
  private candleCache = new Map<string, CacheEntry<MarketCandle[]>>();

  // In-flight request deduplication map
  private inFlightQuotes = new Map<string, Promise<MarketPrice>>();
  private inFlightCandles = new Map<string, Promise<MarketCandle[]>>();

  // Rate limit tracking
  private requestTimestamps: number[] = [];
  private dailyRequestCount = 0;
  private dailyResetTime = Date.now() + 24 * 3600 * 1000;
  private isRateLimited = false;
  private rateLimitCooldownUntil = 0;

  // Rate limits for Twelve Data free tier: 8 / min, 800 / day
  private readonly MINUTE_LIMIT = 8;
  private readonly DAILY_LIMIT = 800;

  constructor() {
    this.apiKey = process.env.TWELVE_DATA_API_KEY || '';
  }

  private getApiKey(): string {
    return (process.env.TWELVE_DATA_API_KEY || this.apiKey || '').trim();
  }

  public get isConfigured(): boolean {
    const key = this.getApiKey();
    return Boolean(key && key.length > 5);
  }

  /**
   * Tracks and enforces rate-limit constraints before sending HTTP requests.
   */
  private checkRateLimit(): { allowed: boolean; reason?: string } {
    const now = Date.now();

    // Check daily reset
    if (now > this.dailyResetTime) {
      this.dailyRequestCount = 0;
      this.dailyResetTime = now + 24 * 3600 * 1000;
    }

    // Check if in cooldown
    if (this.isRateLimited && now < this.rateLimitCooldownUntil) {
      const waitSec = Math.ceil((this.rateLimitCooldownUntil - now) / 1000);
      return {
        allowed: false,
        reason: `MARKET DATA API LIMIT REACHED (Cooldown: ${waitSec}s)`,
      };
    } else if (this.isRateLimited && now >= this.rateLimitCooldownUntil) {
      this.isRateLimited = false;
    }

    // Purge timestamps older than 60 seconds
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60000);

    if (this.requestTimestamps.length >= this.MINUTE_LIMIT) {
      return {
        allowed: false,
        reason: 'Rate limit threshold reached (8 req/min). Using cache.',
      };
    }

    if (this.dailyRequestCount >= this.DAILY_LIMIT) {
      return {
        allowed: false,
        reason: 'Daily API limit reached (800 req/day).',
      };
    }

    return { allowed: true };
  }

  private registerRequest(): void {
    const now = Date.now();
    this.requestTimestamps.push(now);
    this.dailyRequestCount++;
  }

  private handleRateLimitHit(message?: string): void {
    this.isRateLimited = true;
    this.rateLimitCooldownUntil = Date.now() + 65 * 1000; // 65-second cooldown
    console.warn(`[TwelveDataProvider] Rate limit hit: ${message || 'HTTP 429'}. Cooling down for 65s.`);
  }

  /**
   * Translates internal Timeframe to Twelve Data interval parameter
   */
  private formatInterval(tf: Timeframe): string {
    switch (tf) {
      case 'M5':
        return '5min';
      case 'M15':
        return '15min';
      case 'H1':
        return '1h';
      case 'H4':
        return '4h';
      case 'D1':
        return '1day';
      default:
        return '15min';
    }
  }

  /**
   * Retrieves current market price quote with caching and deduplication.
   */
  public async getQuote(asset: Asset): Promise<MarketPrice> {
    const cacheKey = `quote_${asset.symbol}`;
    const cached = this.quoteCache.get(cacheKey);
    const now = Date.now();

    // Return fresh cache if within 20s TTL
    if (cached && now - cached.timestamp < cached.ttlMs) {
      return cached.data;
    }

    // Coalesce in-flight requests
    if (this.inFlightQuotes.has(cacheKey)) {
      return this.inFlightQuotes.get(cacheKey)!;
    }

    const fetchPromise = this.fetchQuoteInternal(asset, cached?.data);
    this.inFlightQuotes.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      if (result.price > 0) {
        this.quoteCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          ttlMs: 30000, // 30-second cache TTL for valid quotes
        });
      } else if (cached?.data && cached.data.price > 0) {
        return {
          ...cached.data,
          status: 'STALE',
          dataSource: 'Twelve Data (Cached - Fallback)',
          errorMessage: result.errorMessage || 'Provider rate limit or temporary cooldown.',
        };
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
        dataSource: 'Twelve Data (Unconfigured)',
        status: 'UNCONFIGURED' as any,
        errorMessage: 'TWELVE_DATA_API_KEY is not configured',
      };
    }

    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      if (previousQuote && previousQuote.price > 0) {
        return {
          ...previousQuote,
          status: 'STALE',
          dataSource: 'Twelve Data (Cached - Rate Limit Cooldown)',
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
        dataSource: 'Twelve Data',
        status: 'RATE_LIMITED',
        errorMessage: 'MARKET DATA API LIMIT REACHED',
      };
    }

    try {
      this.registerRequest();

      // Build Twelve Data quote URL
      const apiKey = this.getApiKey();
      const querySymbol = asset.providerSymbol;
      const url = `${this.baseUrl}/quote?symbol=${encodeURIComponent(querySymbol)}&apikey=${encodeURIComponent(
        apiKey
      )}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

      if (res.status === 429) {
        this.handleRateLimitHit('HTTP 429 Too Many Requests');
        if (previousQuote && previousQuote.price > 0) {
          return {
            ...previousQuote,
            status: 'STALE',
            dataSource: 'Twelve Data (Cached - Rate Limited)',
            errorMessage: 'MARKET DATA API LIMIT REACHED',
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
          dataSource: 'Twelve Data',
          status: 'RATE_LIMITED',
          errorMessage: 'MARKET DATA API LIMIT REACHED',
        };
      }

      if (!res.ok) {
        throw new Error(`Twelve Data returned status ${res.status}`);
      }

      const data = await res.json();

      // Handle Twelve Data JSON error responses
      if (data.code || data.status === 'error') {
        if (data.code === 429 || (data.message && data.message.includes('API limit')) || (data.message && data.message.includes('API credits'))) {
          this.handleRateLimitHit(data.message);
          return {
            symbol: asset.symbol,
            displayName: asset.displayName,
            assetClass: asset.assetClass,
            price: previousQuote?.price || 0,
            high24h: previousQuote?.high24h || 0,
            low24h: previousQuote?.low24h || 0,
            change24h: previousQuote?.change24h || 0,
            changePercent24h: previousQuote?.changePercent24h || 0,
            timestamp: Date.now(),
            lastUpdate: new Date().toISOString(),
            marketStatus,
            dataSource: previousQuote?.price ? 'Twelve Data (Cached)' : 'Twelve Data',
            status: previousQuote?.price ? 'STALE' : 'RATE_LIMITED',
            errorMessage: 'MARKET DATA API LIMIT REACHED',
          };
        }

        // Instrument unavailable on current plan / provider
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
          dataSource: 'Twelve Data',
          status: 'UNAVAILABLE',
          errorMessage: 'DATA NOT AVAILABLE FROM CURRENT PROVIDER',
        };
      }

      const closePrice = parseFloat(data.close);
      if (!Number.isFinite(closePrice) || closePrice <= 0) {
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
          dataSource: 'Twelve Data',
          status: 'UNAVAILABLE',
          errorMessage: 'DATA NOT AVAILABLE FROM CURRENT PROVIDER',
        };
      }

      const openPrice = parseFloat(data.open) || closePrice;
      const high24h = parseFloat(data.high) || closePrice * 1.005;
      const low24h = parseFloat(data.low) || closePrice * 0.995;
      const prevClose = parseFloat(data.previous_close) || openPrice;
      const change24h = parseFloat(data.change) || closePrice - prevClose;
      const changePercent24h = parseFloat(data.percent_change) || (prevClose > 0 ? (change24h / prevClose) * 100 : 0);

      // Determine freshness using real quote timestamp
      const quoteTimestamp = data.last_quote_at
        ? data.last_quote_at * 1000
        : data.timestamp
        ? data.timestamp * 1000
        : new Date((data.datetime || '').includes('T') ? data.datetime : (data.datetime || '').replace(' ', 'T') + 'Z').getTime() || Date.now();

      const ageMs = Date.now() - quoteTimestamp;
      const status: MarketDataStatus =
        marketStatus === 'WEEKEND'
          ? 'OFFLINE'
          : ageMs > (asset.assetClass === 'CRYPTO' ? 10 * 60 * 1000 : 30 * 60 * 1000)
          ? 'STALE'
          : 'LIVE';

      return {
        symbol: asset.symbol,
        displayName: asset.displayName,
        assetClass: asset.assetClass,
        price: closePrice,
        bid: parseFloat(data.bid) || closePrice * 0.9999,
        ask: parseFloat(data.ask) || closePrice * 1.0001,
        high24h,
        low24h,
        change24h,
        changePercent24h,
        timestamp: quoteTimestamp,
        lastUpdate: new Date(quoteTimestamp).toLocaleTimeString(),
        marketStatus,
        dataSource: `Twelve Data (Live Direct)`,
        status,
        exchange: data.exchange || asset.exchange || 'Twelve Data',
      };
    } catch (error: any) {
      console.error(`[TwelveDataProvider] Error fetching quote for ${asset.symbol}:`, error.message);
      if (previousQuote) {
        return {
          ...previousQuote,
          status: 'STALE',
          dataSource: 'Twelve Data (Cached)',
          errorMessage: error.message,
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
        dataSource: 'Twelve Data',
        status: 'ERROR',
        errorMessage: 'Network error communicating with Twelve Data API',
      };
    }
  }

  /**
   * Retrieves historical candles for an asset and timeframe.
   */
  public async getHistoricalCandles(
    asset: Asset,
    timeframe: Timeframe,
    numberOfCandles = 100
  ): Promise<MarketCandle[]> {
    const cacheKey = `candles_${asset.symbol}_${timeframe}`;
    const cached = this.candleCache.get(cacheKey);
    const now = Date.now();

    const ttlMs =
      timeframe === 'M5'
        ? 30000
        : timeframe === 'M15'
        ? 60000
        : timeframe === 'H1'
        ? 180000
        : 300000;

    if (cached && now - cached.timestamp < cached.ttlMs && cached.data.length >= 10) {
      return cached.data;
    }

    if (this.inFlightCandles.has(cacheKey)) {
      return this.inFlightCandles.get(cacheKey)!;
    }

    const fetchPromise = this.fetchCandlesInternal(asset, timeframe, numberOfCandles, cached?.data);
    this.inFlightCandles.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      if (result.length > 0) {
        this.candleCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          ttlMs,
        });
      }
      return result;
    } finally {
      this.inFlightCandles.delete(cacheKey);
    }
  }

  private async fetchCandlesInternal(
    asset: Asset,
    timeframe: Timeframe,
    numberOfCandles: number,
    previousCandles?: MarketCandle[]
  ): Promise<MarketCandle[]> {
    if (!this.isConfigured) {
      return previousCandles || [];
    }

    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      if (previousCandles && previousCandles.length > 0) {
        return previousCandles;
      }
      return [];
    }

    try {
      this.registerRequest();

      const apiKey = this.getApiKey();
      const interval = this.formatInterval(timeframe);
      const url = `${this.baseUrl}/time_series?symbol=${encodeURIComponent(
        asset.providerSymbol
      )}&interval=${encodeURIComponent(interval)}&outputsize=${Math.min(
        150,
        Math.max(30, numberOfCandles)
      )}&apikey=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });

      if (res.status === 429) {
        this.handleRateLimitHit('HTTP 429 on candles request');
        return previousCandles || [];
      }

      if (!res.ok) {
        throw new Error(`Twelve Data time_series error status: ${res.status}`);
      }

      const data = await res.json();

      if (data.code === 429 || (data.message && data.message.includes('API limit'))) {
        this.handleRateLimitHit(data.message);
        return previousCandles || [];
      }

      if (data.status === 'error' || !Array.isArray(data.values) || data.values.length === 0) {
        console.warn(`[TwelveDataProvider] No candle values for ${asset.symbol} on ${timeframe}:`, data.message || 'Empty');
        return previousCandles || [];
      }

      // Format candles
      const rawCandles = data.values.map((v: any) => ({
        datetime: v.datetime,
        open: v.open,
        high: v.high,
        low: v.low,
        close: v.close,
        volume: v.volume,
        source: 'Twelve Data',
      }));

      // Validate candles
      const validation = validateMarketCandles(rawCandles, asset.symbol, timeframe, asset.assetClass);

      if (!validation.isValid || validation.cleanCandles.length === 0) {
        console.warn(`[TwelveDataProvider] Validation failed for ${asset.symbol} ${timeframe}:`, validation.errors);
        return previousCandles || [];
      }

      return validation.cleanCandles;
    } catch (error: any) {
      console.error(`[TwelveDataProvider] Candle fetch error for ${asset.symbol}:`, error.message);
      return previousCandles || [];
    }
  }

  /**
   * Retrieves provider status & diagnostic metadata
   */
  public async getProviderStatus(): Promise<ProviderStatusInfo> {
    const now = Date.now();
    const activeMinuteRequests = this.requestTimestamps.filter((t) => now - t < 60000).length;

    let status: ProviderStatusInfo['status'] = 'ONLINE';
    let message = 'Twelve Data API connected and operating normally.';

    if (!this.isConfigured) {
      status = 'UNCONFIGURED';
      message = 'TWELVE_DATA_API_KEY is not provided in environment.';
    } else if (this.isRateLimited && now < this.rateLimitCooldownUntil) {
      status = 'RATE_LIMITED';
      const cooldownSec = Math.ceil((this.rateLimitCooldownUntil - now) / 1000);
      message = `MARKET DATA API LIMIT REACHED. Cooling down (${cooldownSec}s remaining).`;
    } else if (activeMinuteRequests >= this.MINUTE_LIMIT - 1) {
      status = 'DEGRADED';
      message = 'Approaching 8 req/min threshold. Caching prioritized.';
    }

    return {
      provider: this.name,
      configured: this.isConfigured,
      status,
      message,
      lastChecked: now,
      rateLimitStats: {
        minuteRequests: activeMinuteRequests,
        minuteLimit: this.MINUTE_LIMIT,
        dailyRequests: this.dailyRequestCount,
        dailyLimit: this.DAILY_LIMIT,
        isLimitReached: this.isRateLimited,
      },
    };
  }

  public async isSymbolSupported(asset: Asset): Promise<boolean> {
    const quote = await this.getQuote(asset);
    return quote.status !== 'UNAVAILABLE';
  }
}
