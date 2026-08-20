import { MarketDataProvider, HealthCheckResult } from './MarketDataProvider';
import {
  Asset,
  MarketPrice,
  MarketCandle,
  Timeframe,
  ProviderStatusInfo,
  SingleProviderStatus,
  ProviderState,
  ProviderErrorReason,
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

  // Provider State Machine
  private state: ProviderState = 'DISCONNECTED';
  private lastSuccessTime: number | null = null;
  private lastFailureTime: number | null = null;
  private lastErrorMessage: string | null = null;
  private lastErrorReason: ProviderErrorReason | null = null;
  private consecutiveFailures = 0;
  private lastTestedSymbol = 'BTC/USD';

  // In-memory cache
  private quoteCache = new Map<string, CacheEntry<MarketPrice>>();
  private candleCache = new Map<string, CacheEntry<MarketCandle[]>>();

  // In-flight request deduplication map
  private inFlightQuotes = new Map<string, Promise<MarketPrice>>();
  private inFlightCandles = new Map<string, Promise<MarketCandle[]>>();

  // Rate limit tracking for Twelve Data free tier: 8 / min, 800 / day
  private requestTimestamps: number[] = [];
  private dailyRequestCount = 0;
  private dailyResetTime = Date.now() + 24 * 3600 * 1000;
  private isRateLimited = false;
  private rateLimitCooldownUntil = 0;

  private readonly MINUTE_LIMIT = 8;
  private readonly DAILY_LIMIT = 800;

  constructor() {
    this.apiKey = process.env.TWELVE_DATA_API_KEY || '';
    this.logApiKeyStatus();
  }

  private getApiKey(): string {
    return (process.env.TWELVE_DATA_API_KEY || this.apiKey || '').trim();
  }

  public get isConfigured(): boolean {
    const key = this.getApiKey();
    return Boolean(key && key.length > 5);
  }

  /**
   * Logs configuration status safely without printing the API key (Requirement 3 & 16)
   */
  public logApiKeyStatus(): void {
    console.log(`TWELVE_DATA_API_KEY: ${this.isConfigured ? 'CONFIGURED' : 'MISSING'}`);
  }

  /**
   * Structured error logger (Requirement 2)
   */
  private logProviderError(status: number | string, reason: ProviderErrorReason, details?: string): void {
    console.log(
      `[TWELVE DATA ERROR]\nstatus: ${status}\nreason: ${reason}\ntimestamp: ${new Date().toISOString()}${
        details ? `\ndetails: ${details}` : ''
      }`
    );
  }

  public getState(): ProviderState {
    const now = Date.now();
    if (!this.isConfigured) return 'OFFLINE';
    if (this.isRateLimited && now < this.rateLimitCooldownUntil) return 'RATE_LIMITED';
    if (this.consecutiveFailures > 0 && now < this.rateLimitCooldownUntil) return 'COOLDOWN';
    if (this.state === 'DISCONNECTED' || this.state === 'CONNECTING') return this.state;
    if (this.lastSuccessTime && now - this.lastSuccessTime < 120000) return 'CONNECTED';
    return this.state;
  }

  /**
   * Tracks and enforces rate-limit constraints before sending HTTP requests.
   */
  private checkRateLimit(): { allowed: boolean; reason?: string; errorReason?: ProviderErrorReason } {
    const now = Date.now();

    if (!this.isConfigured) {
      return {
        allowed: false,
        reason: 'TWELVE_DATA_API_KEY is not configured',
        errorReason: 'UNCONFIGURED',
      };
    }

    // Check daily reset
    if (now > this.dailyResetTime) {
      this.dailyRequestCount = 0;
      this.dailyResetTime = now + 24 * 3600 * 1000;
    }

    // Check if in cooldown
    if (now < this.rateLimitCooldownUntil) {
      const waitSec = Math.ceil((this.rateLimitCooldownUntil - now) / 1000);
      return {
        allowed: false,
        reason: `Rate limit or cooldown active (${waitSec}s remaining).`,
        errorReason: this.isRateLimited ? 'RATE_LIMIT' : this.lastErrorReason || 'SERVER_ERROR',
      };
    } else if (this.rateLimitCooldownUntil > 0 && now >= this.rateLimitCooldownUntil) {
      this.isRateLimited = false;
      this.rateLimitCooldownUntil = 0;
      if (this.state === 'COOLDOWN' || this.state === 'RATE_LIMITED') {
        this.state = 'CONNECTING';
      }
    }

    // Purge timestamps older than 60 seconds
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60000);

    if (this.requestTimestamps.length >= this.MINUTE_LIMIT) {
      this.isRateLimited = true;
      this.rateLimitCooldownUntil = now + 15 * 1000; // brief 15s wait for sliding window
      return {
        allowed: false,
        reason: 'Rate limit threshold reached (8 req/min). Using cache.',
        errorReason: 'RATE_LIMIT',
      };
    }

    if (this.dailyRequestCount >= this.DAILY_LIMIT) {
      this.isRateLimited = true;
      this.rateLimitCooldownUntil = this.dailyResetTime;
      return {
        allowed: false,
        reason: 'Daily API limit reached (800 req/day).',
        errorReason: 'RATE_LIMIT',
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
    this.state = 'RATE_LIMITED';
    this.lastFailureTime = Date.now();
    this.lastErrorMessage = message || 'HTTP 429 Rate Limit Exceeded';
    this.lastErrorReason = 'RATE_LIMIT';
    this.rateLimitCooldownUntil = Date.now() + 60 * 1000; // 60-second cooldown
    this.logProviderError(429, 'RATE_LIMIT', message);
  }

  private handleTransientFailure(status: number, reason: ProviderErrorReason, message: string): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.lastErrorMessage = message;
    this.lastErrorReason = reason;

    // Exponential backoff: 5s, 10s, 20s, 30s, 60s max (Requirement 14)
    const backoffSec = Math.min(60, Math.max(5, 5 * Math.pow(2, this.consecutiveFailures - 1)));
    this.rateLimitCooldownUntil = Date.now() + backoffSec * 1000;
    this.state = 'COOLDOWN';
    this.logProviderError(status, reason, `${message} (Backoff: ${backoffSec}s)`);
  }

  private handleAuthFailure(status: number, message: string): void {
    this.state = 'OFFLINE';
    this.lastFailureTime = Date.now();
    this.lastErrorMessage = message;
    this.lastErrorReason = 'AUTHENTICATION_ERROR';
    this.logProviderError(status, 'AUTHENTICATION_ERROR', message);
  }

  public resetCooldown(): void {
    this.isRateLimited = false;
    this.rateLimitCooldownUntil = 0;
    this.consecutiveFailures = 0;
    this.requestTimestamps = [];
    this.state = 'CONNECTING';
    console.log('[TwelveDataProvider] Cooldown manually reset.');
  }

  /**
   * Active, lightweight health check against Twelve Data live API (Requirement 5)
   */
  public async checkHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    this.lastTestedSymbol = 'BTC/USD';

    if (!this.isConfigured) {
      this.state = 'OFFLINE';
      this.lastErrorReason = 'UNCONFIGURED';
      return {
        healthy: false,
        state: 'OFFLINE',
        latencyMs: 0,
        testedSymbol: this.lastTestedSymbol,
        errorReason: 'TWELVE_DATA_API_KEY is not configured',
      };
    }

    try {
      this.state = 'CONNECTING';
      const apiKey = this.getApiKey();
      const url = `${this.baseUrl}/quote?symbol=BTC/USD&apikey=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const latencyMs = Date.now() - startTime;

      if (res.status === 401 || res.status === 403) {
        this.handleAuthFailure(res.status, 'Invalid or unauthorized API key');
        return {
          healthy: false,
          state: 'OFFLINE',
          latencyMs,
          testedSymbol: 'BTC/USD',
          errorReason: 'AUTHENTICATION_ERROR',
        };
      }

      if (res.status === 429) {
        this.handleRateLimitHit('HTTP 429 on health check');
        return {
          healthy: false,
          state: 'RATE_LIMITED',
          latencyMs,
          testedSymbol: 'BTC/USD',
          errorReason: 'RATE_LIMIT',
        };
      }

      if (!res.ok) {
        this.handleTransientFailure(res.status, 'SERVER_ERROR', `HTTP ${res.status}`);
        return {
          healthy: false,
          state: 'COOLDOWN',
          latencyMs,
          testedSymbol: 'BTC/USD',
          errorReason: 'SERVER_ERROR',
        };
      }

      const data = await res.json();

      if (data.code === 401 || data.code === 403) {
        this.handleAuthFailure(data.code, data.message || 'Unauthorized');
        return {
          healthy: false,
          state: 'OFFLINE',
          latencyMs,
          testedSymbol: 'BTC/USD',
          errorReason: 'AUTHENTICATION_ERROR',
        };
      }

      if (data.code === 429 || (data.message && data.message.includes('API limit'))) {
        this.handleRateLimitHit(data.message);
        return {
          healthy: false,
          state: 'RATE_LIMITED',
          latencyMs,
          testedSymbol: 'BTC/USD',
          errorReason: 'RATE_LIMIT',
        };
      }

      const closePrice = parseFloat(data.close);
      if (!Number.isFinite(closePrice) || closePrice <= 0) {
        this.lastFailureTime = Date.now();
        this.lastErrorReason = 'INVALID_DATA';
        this.state = 'ERROR';
        return {
          healthy: false,
          state: 'ERROR',
          latencyMs,
          testedSymbol: 'BTC/USD',
          errorReason: 'INVALID_DATA: Zero or non-finite price returned',
        };
      }

      // Valid response verified
      this.state = 'CONNECTED';
      this.lastSuccessTime = Date.now();
      this.consecutiveFailures = 0;
      this.isRateLimited = false;
      this.rateLimitCooldownUntil = 0;

      return {
        healthy: true,
        state: 'CONNECTED',
        latencyMs,
        testedSymbol: 'BTC/USD',
        price: closePrice,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err.name === 'AbortError' || err.name === 'TimeoutError' || err.message?.includes('timeout');
      const reason: ProviderErrorReason = isTimeout ? 'NETWORK_TIMEOUT' : 'SERVER_ERROR';

      this.handleTransientFailure(0, reason, err.message || 'Network error');
      return {
        healthy: false,
        state: 'COOLDOWN',
        latencyMs,
        testedSymbol: 'BTC/USD',
        errorReason: reason,
      };
    }
  }

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

    // Return fresh cache if within 25s TTL
    if (cached && now - cached.timestamp < cached.ttlMs && cached.data.price > 0) {
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
          ttlMs: 30000,
        });
      } else if (cached?.data && cached.data.price > 0) {
        return {
          ...cached.data,
          status: 'STALE',
          dataSource: 'Twelve Data (Cached - Fallback)',
          errorMessage: result.errorMessage || 'Provider temporary cooldown.',
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
      this.state = 'OFFLINE';
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
          dataSource: 'Twelve Data (Cached - Cooldown)',
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
        status: this.isRateLimited ? 'RATE_LIMITED' : 'UNAVAILABLE',
        errorMessage: rateCheck.reason || 'MARKET DATA API LIMIT REACHED',
      };
    }

    try {
      this.registerRequest();

      const apiKey = this.getApiKey();
      const querySymbol = asset.providerSymbol || asset.symbol;
      const url = `${this.baseUrl}/quote?symbol=${encodeURIComponent(querySymbol)}&apikey=${encodeURIComponent(
        apiKey
      )}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

      if (res.status === 401 || res.status === 403) {
        this.handleAuthFailure(res.status, 'Invalid or unauthorized API key');
        if (previousQuote && previousQuote.price > 0) {
          return {
            ...previousQuote,
            status: 'STALE',
            dataSource: 'Twelve Data (Cached)',
            errorMessage: 'Twelve Data Authentication Error',
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
          errorMessage: 'AUTHENTICATION_ERROR: Invalid Twelve Data API key',
        };
      }

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
        this.handleTransientFailure(res.status, 'SERVER_ERROR', `HTTP ${res.status}`);
        throw new Error(`Twelve Data returned status ${res.status}`);
      }

      const data = await res.json();

      // Handle Twelve Data JSON error responses
      if (data.code || data.status === 'error') {
        if (data.code === 401 || data.code === 403) {
          this.handleAuthFailure(data.code, data.message || 'Unauthorized');
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
            errorMessage: 'AUTHENTICATION_ERROR',
          };
        }

        if (data.code === 429 || (data.message && (data.message.includes('API limit') || data.message.includes('API credits')))) {
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

        // Unsupported symbol error - do NOT put provider in cooldown!
        this.logProviderError(data.code || 400, 'UNSUPPORTED_SYMBOL', data.message);
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
          errorMessage: data.message || 'SYMBOL NOT FOUND ON PROVIDER',
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

      // Success
      this.state = 'CONNECTED';
      this.lastSuccessTime = Date.now();
      this.consecutiveFailures = 0;

      const openPrice = parseFloat(data.open) || closePrice;
      const high24h = parseFloat(data.high) || closePrice * 1.005;
      const low24h = parseFloat(data.low) || closePrice * 0.995;
      const prevClose = parseFloat(data.previous_close) || openPrice;
      const change24h = parseFloat(data.change) || closePrice - prevClose;
      const changePercent24h = parseFloat(data.percent_change) || (prevClose > 0 ? (change24h / prevClose) * 100 : 0);

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
      const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError' || error.message?.includes('timeout');
      const reason: ProviderErrorReason = isTimeout ? 'NETWORK_TIMEOUT' : 'SERVER_ERROR';
      this.handleTransientFailure(0, reason, error.message);

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
      return previousCandles || [];
    }

    try {
      this.registerRequest();

      const apiKey = this.getApiKey();
      const interval = this.formatInterval(timeframe);
      const url = `${this.baseUrl}/time_series?symbol=${encodeURIComponent(
        asset.providerSymbol || asset.symbol
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
        this.handleTransientFailure(res.status, 'SERVER_ERROR', `HTTP ${res.status}`);
        return previousCandles || [];
      }

      const data = await res.json();

      if (data.code === 429 || (data.message && (data.message.includes('API limit') || data.message.includes('API credits')))) {
        this.handleRateLimitHit(data.message);
        return previousCandles || [];
      }

      if (data.status === 'error' || !Array.isArray(data.values) || data.values.length === 0) {
        console.warn(`[TwelveDataProvider] No candle values for ${asset.symbol} on ${timeframe}:`, data.message || 'Empty');
        return previousCandles || [];
      }

      this.state = 'CONNECTED';
      this.lastSuccessTime = Date.now();
      this.consecutiveFailures = 0;

      const rawCandles = data.values.map((v: any) => ({
        datetime: v.datetime,
        open: v.open,
        high: v.high,
        low: v.low,
        close: v.close,
        volume: v.volume,
        source: 'Twelve Data',
      }));

      const validation = validateMarketCandles(rawCandles, asset.symbol, timeframe, asset.assetClass);
      if (!validation.isValid || validation.cleanCandles.length === 0) {
        return previousCandles || [];
      }

      return validation.cleanCandles;
    } catch (error: any) {
      const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError' || error.message?.includes('timeout');
      const reason: ProviderErrorReason = isTimeout ? 'NETWORK_TIMEOUT' : 'SERVER_ERROR';
      this.handleTransientFailure(0, reason, error.message);
      return previousCandles || [];
    }
  }

  /**
   * Retrieves detailed SingleProviderStatus (Requirement 11)
   */
  public async getSingleStatus(): Promise<SingleProviderStatus> {
    const now = Date.now();
    const currentState = this.getState();
    const activeMinuteRequests = this.requestTimestamps.filter((t) => now - t < 60000).length;
    const cooldownRemainingSec = this.rateLimitCooldownUntil > now ? Math.ceil((this.rateLimitCooldownUntil - now) / 1000) : null;

    let legacyStatus: SingleProviderStatus['status'] = 'ONLINE';
    let message = 'Twelve Data primary live market data stream active';

    if (!this.isConfigured) {
      legacyStatus = 'UNCONFIGURED';
      message = 'TWELVE_DATA_API_KEY is not configured in environment.';
    } else if (currentState === 'RATE_LIMITED') {
      legacyStatus = 'RATE_LIMITED';
      message = `Rate limit cooldown active (${cooldownRemainingSec || 0}s remaining).`;
    } else if (currentState === 'COOLDOWN') {
      legacyStatus = 'COOLDOWN';
      message = `Transient backoff active (${cooldownRemainingSec || 0}s remaining): ${this.lastErrorMessage || 'Retrying'}`;
    } else if (currentState === 'OFFLINE') {
      legacyStatus = 'OFFLINE';
      message = this.lastErrorMessage || 'Twelve Data is offline or unauthenticated.';
    } else if (currentState === 'DEGRADED') {
      legacyStatus = 'DEGRADED';
      message = 'Approaching minute rate limit.';
    }

    return {
      name: this.name,
      configured: this.isConfigured,
      state: currentState,
      status: legacyStatus,
      message,
      lastSuccess: this.lastSuccessTime ? new Date(this.lastSuccessTime).toISOString() : null,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      lastError: this.lastErrorMessage,
      lastErrorReason: this.lastErrorReason || undefined,
      cooldownUntil: this.rateLimitCooldownUntil > now ? this.rateLimitCooldownUntil : null,
      cooldownRemainingSec: cooldownRemainingSec || undefined,
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

  public async getProviderStatus(): Promise<ProviderStatusInfo> {
    const single = await this.getSingleStatus();
    return {
      provider: this.name,
      configured: this.isConfigured,
      activeProvider: this.name,
      marketFeed: single.state === 'CONNECTED' ? 'LIVE' : single.state === 'RATE_LIMITED' ? 'COOLDOWN' : 'OFFLINE',
      state: single.state,
      status: single.status,
      message: single.message,
      lastChecked: single.lastChecked,
      providers: {
        twelveData: single,
        finnhub: single, // will be replaced in MarketDataManager
      },
      rateLimitStats: single.rateLimitStats,
    };
  }

  public async isSymbolSupported(asset: Asset): Promise<boolean> {
    return this.isConfigured;
  }
}
