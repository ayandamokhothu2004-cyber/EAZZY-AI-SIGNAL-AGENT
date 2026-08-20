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

export class FinnhubProvider implements MarketDataProvider {
  public readonly name = 'Finnhub';
  private baseUrl = 'https://finnhub.io/api/v1';

  // Provider State Machine
  private state: ProviderState = 'DISCONNECTED';
  private lastSuccessTime: number | null = null;
  private lastFailureTime: number | null = null;
  private lastErrorMessage: string | null = null;
  private lastErrorReason: ProviderErrorReason | null = null;
  private consecutiveFailures = 0;
  private lastTestedSymbol = 'BINANCE:BTCUSDT';

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

  constructor() {
    this.logApiKeyStatus();
  }

  private getApiKey(): string {
    return (process.env.FINNHUB_API_KEY || '').trim();
  }

  public get isConfigured(): boolean {
    const key = this.getApiKey();
    return Boolean(key && key.length > 5);
  }

  /**
   * Logs configuration status safely without printing the API key (Requirement 4 & 16)
   */
  public logApiKeyStatus(): void {
    console.log(`FINNHUB_API_KEY: ${this.isConfigured ? 'CONFIGURED' : 'MISSING'}`);
  }

  /**
   * Structured error logger (Requirement 4)
   */
  private logProviderError(status: number | string, reason: ProviderErrorReason, details?: string): void {
    console.log(
      `[FINNHUB ERROR]\nstatus: ${status}\nreason: ${reason}\ntimestamp: ${new Date().toISOString()}${
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

  private checkRateLimit(): { allowed: boolean; reason?: string; errorReason?: ProviderErrorReason } {
    const now = Date.now();

    if (!this.isConfigured) {
      return {
        allowed: false,
        reason: 'FINNHUB_API_KEY is not configured',
        errorReason: 'UNCONFIGURED',
      };
    }

    if (now > this.dailyResetTime) {
      this.dailyRequestCount = 0;
      this.dailyResetTime = now + 24 * 3600 * 1000;
    }

    if (now < this.rateLimitCooldownUntil) {
      const waitSec = Math.ceil((this.rateLimitCooldownUntil - now) / 1000);
      return {
        allowed: false,
        reason: `Finnhub cooldown active (${waitSec}s remaining).`,
        errorReason: this.isRateLimited ? 'RATE_LIMIT' : this.lastErrorReason || 'SERVER_ERROR',
      };
    } else if (this.rateLimitCooldownUntil > 0 && now >= this.rateLimitCooldownUntil) {
      this.isRateLimited = false;
      this.rateLimitCooldownUntil = 0;
      if (this.state === 'COOLDOWN' || this.state === 'RATE_LIMITED') {
        this.state = 'CONNECTING';
      }
    }

    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60000);

    if (this.requestTimestamps.length >= this.MINUTE_LIMIT) {
      this.isRateLimited = true;
      this.rateLimitCooldownUntil = now + 15 * 1000;
      return {
        allowed: false,
        reason: 'Finnhub rate limit threshold reached (30 req/min). Using cache.',
        errorReason: 'RATE_LIMIT',
      };
    }

    if (this.dailyRequestCount >= this.DAILY_LIMIT) {
      this.isRateLimited = true;
      this.rateLimitCooldownUntil = this.dailyResetTime;
      return {
        allowed: false,
        reason: 'Finnhub daily limit reached.',
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
    this.rateLimitCooldownUntil = Date.now() + 60 * 1000;
    this.logProviderError(429, 'RATE_LIMIT', message);
  }

  private handleTransientFailure(status: number, reason: ProviderErrorReason, message: string): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.lastErrorMessage = message;
    this.lastErrorReason = reason;

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
    console.log('[FinnhubProvider] Cooldown manually reset.');
  }

  /**
   * Performs an active, lightweight server-side health check against Finnhub API (Requirement 4 & 5).
   * Uses BTC/USD (`BINANCE:BTCUSDT`) or `QQQ` which are fully supported on Finnhub free tier.
   */
  public async checkHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    this.lastTestedSymbol = 'BINANCE:BTCUSDT';

    if (!this.isConfigured) {
      this.state = 'OFFLINE';
      this.lastErrorReason = 'UNCONFIGURED';
      return {
        healthy: false,
        state: 'OFFLINE',
        latencyMs: 0,
        testedSymbol: this.lastTestedSymbol,
        errorReason: 'FINNHUB_API_KEY is not configured',
      };
    }

    try {
      this.state = 'CONNECTING';
      const apiKey = this.getApiKey();
      const url = `${this.baseUrl}/quote?symbol=BINANCE:BTCUSDT&token=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const latencyMs = Date.now() - startTime;

      if (res.status === 401 || res.status === 403) {
        this.handleAuthFailure(res.status, 'Invalid or unauthorized Finnhub API key');
        return {
          healthy: false,
          state: 'OFFLINE',
          latencyMs,
          testedSymbol: this.lastTestedSymbol,
          errorReason: 'AUTHENTICATION_ERROR',
        };
      }

      if (res.status === 429) {
        this.handleRateLimitHit('HTTP 429 on health check');
        return {
          healthy: false,
          state: 'RATE_LIMITED',
          latencyMs,
          testedSymbol: this.lastTestedSymbol,
          errorReason: 'RATE_LIMIT',
        };
      }

      if (!res.ok) {
        this.handleTransientFailure(res.status, 'SERVER_ERROR', `HTTP ${res.status}`);
        return {
          healthy: false,
          state: 'COOLDOWN',
          latencyMs,
          testedSymbol: this.lastTestedSymbol,
          errorReason: 'SERVER_ERROR',
        };
      }

      const data = await res.json();
      const currentPrice = typeof data.c === 'number' ? data.c : parseFloat(data.c);

      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        this.lastFailureTime = Date.now();
        this.lastErrorReason = 'INVALID_DATA';
        this.state = 'ERROR';
        return {
          healthy: false,
          state: 'ERROR',
          latencyMs,
          testedSymbol: this.lastTestedSymbol,
          errorReason: 'INVALID_DATA: Finnhub quote returned zero or non-finite price',
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
        testedSymbol: this.lastTestedSymbol,
        price: currentPrice,
        timestamp: (data.t ? data.t * 1000 : Date.now()),
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
        testedSymbol: this.lastTestedSymbol,
        errorReason: reason,
      };
    }
  }

  /**
   * Resolves the appropriate Finnhub symbol & API endpoint type for an asset.
   */
  private resolveFinnhubSymbol(asset: Asset): {
    symbol: string;
    endpointType: 'forex' | 'crypto' | 'stock';
    fallbackSymbol?: string;
    isForexPlanRestricted?: boolean;
  } {
    const cleanSym = asset.symbol.toUpperCase().replace(/[-_]/g, '/');

    switch (cleanSym) {
      // Forex
      case 'EUR/USD':
        return { symbol: 'OANDA:EUR_USD', endpointType: 'forex', fallbackSymbol: 'FX:EURUSD', isForexPlanRestricted: true };
      case 'GBP/USD':
        return { symbol: 'OANDA:GBP_USD', endpointType: 'forex', fallbackSymbol: 'FX:GBPUSD', isForexPlanRestricted: true };
      case 'USD/JPY':
        return { symbol: 'OANDA:USD_JPY', endpointType: 'forex', fallbackSymbol: 'FX:USDJPY', isForexPlanRestricted: true };
      case 'AUD/USD':
        return { symbol: 'OANDA:AUD_USD', endpointType: 'forex', fallbackSymbol: 'FX:AUDUSD', isForexPlanRestricted: true };

      // Crypto (Free tier supported!)
      case 'BTC/USD':
        return { symbol: 'BINANCE:BTCUSDT', endpointType: 'crypto', fallbackSymbol: 'COINBASE:BTC-USD' };
      case 'ETH/USD':
        return { symbol: 'BINANCE:ETHUSDT', endpointType: 'crypto', fallbackSymbol: 'COINBASE:ETH-USD' };
      case 'SOL/USD':
        return { symbol: 'BINANCE:SOLUSDT', endpointType: 'crypto', fallbackSymbol: 'COINBASE:SOL-USD' };

      // Commodities (Gold / Silver ETFs)
      case 'XAU/USD':
        return { symbol: 'GLD', endpointType: 'stock', fallbackSymbol: 'OANDA:XAU_USD' };
      case 'XAG/USD':
        return { symbol: 'SLV', endpointType: 'stock', fallbackSymbol: 'OANDA:XAG_USD' };

      // Indices (US ETFs)
      case 'NAS100':
        return { symbol: 'QQQ', endpointType: 'stock' };
      case 'SPX500':
        return { symbol: 'SPY', endpointType: 'stock' };
      case 'US30':
        return { symbol: 'DIA', endpointType: 'stock' };

      default:
        if (asset.assetClass === 'FOREX') {
          const formatted = cleanSym.replace('/', '_');
          return { symbol: `OANDA:${formatted}`, endpointType: 'forex', isForexPlanRestricted: true };
        }
        if (asset.assetClass === 'CRYPTO') {
          const formatted = cleanSym.replace('/', '');
          return { symbol: `BINANCE:${formatted}T`, endpointType: 'crypto' };
        }
        return { symbol: asset.providerSymbol || cleanSym, endpointType: 'stock' };
    }
  }

  private formatResolution(tf: Timeframe): string {
    switch (tf) {
      case 'M5':
        return '5';
      case 'M15':
        return '15';
      case 'H1':
        return '60';
      case 'H4':
        return '60';
      case 'D1':
        return 'D';
      default:
        return '15';
    }
  }

  /**
   * Retrieves current market price quote with caching and deduplication.
   */
  public async getQuote(asset: Asset): Promise<MarketPrice> {
    const cacheKey = `quote_${asset.symbol}`;
    const cached = this.quoteCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < cached.ttlMs && cached.data.price > 0) {
      return cached.data;
    }

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
          dataSource: 'Finnhub (Cached - Fallback)',
          errorMessage: result.errorMessage || 'Finnhub temporary cooldown.',
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
          dataSource: 'Finnhub (Cached - Cooldown)',
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
        status: this.isRateLimited ? 'RATE_LIMITED' : 'UNAVAILABLE',
        errorMessage: rateCheck.reason || 'Finnhub rate limit or cooldown active',
      };
    }

    const resolved = this.resolveFinnhubSymbol(asset);

    try {
      this.registerRequest();

      const apiKey = this.getApiKey();
      const url = `${this.baseUrl}/quote?symbol=${encodeURIComponent(resolved.symbol)}&token=${encodeURIComponent(
        apiKey
      )}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

      if (res.status === 429) {
        this.handleRateLimitHit('HTTP 429 Too Many Requests');
        if (previousQuote && previousQuote.price > 0) {
          return {
            ...previousQuote,
            status: 'STALE',
            dataSource: 'Finnhub (Cached)',
            errorMessage: 'Finnhub rate limit reached',
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
          errorMessage: 'Finnhub rate limit reached',
        };
      }

      if (res.status === 403 || res.status === 401) {
        // If this is a Forex pair on Finnhub free tier, it's a symbol limitation, not total offline!
        if (resolved.isForexPlanRestricted || asset.assetClass === 'FOREX') {
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
            errorMessage: `Finnhub free tier does not include real-time Forex feed for ${asset.symbol}`,
          };
        }

        this.handleAuthFailure(res.status, 'Unauthorized Finnhub API Key');
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
          errorMessage: 'AUTHENTICATION_ERROR: Invalid Finnhub API key',
        };
      }

      if (!res.ok) {
        this.handleTransientFailure(res.status, 'SERVER_ERROR', `HTTP ${res.status}`);
        throw new Error(`Finnhub returned status ${res.status}`);
      }

      const data = await res.json();
      const currentPrice = typeof data.c === 'number' ? data.c : parseFloat(data.c);

      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
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
          errorMessage: `Price unavailable for ${asset.symbol} on Finnhub`,
        };
      }

      // Success
      this.state = 'CONNECTED';
      this.lastSuccessTime = Date.now();
      this.consecutiveFailures = 0;

      const high24h = typeof data.h === 'number' && data.h > 0 ? data.h : currentPrice * 1.005;
      const low24h = typeof data.l === 'number' && data.l > 0 ? data.l : currentPrice * 0.995;
      const prevClose = typeof data.pc === 'number' && data.pc > 0 ? data.pc : currentPrice;
      const change24h = typeof data.d === 'number' ? data.d : currentPrice - prevClose;
      const changePercent24h = typeof data.dp === 'number' ? data.dp : (prevClose > 0 ? (change24h / prevClose) * 100 : 0);
      const quoteTime = data.t ? data.t * 1000 : Date.now();

      const ageMs = Date.now() - quoteTime;
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
        price: currentPrice,
        bid: currentPrice * 0.9999,
        ask: currentPrice * 1.0001,
        high24h,
        low24h,
        change24h,
        changePercent24h,
        timestamp: quoteTime,
        lastUpdate: new Date(quoteTime).toLocaleTimeString(),
        marketStatus,
        dataSource: `Finnhub (Live Fallback)`,
        status,
        exchange: 'Finnhub',
      };
    } catch (error: any) {
      const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError' || error.message?.includes('timeout');
      const reason: ProviderErrorReason = isTimeout ? 'NETWORK_TIMEOUT' : 'SERVER_ERROR';
      this.handleTransientFailure(0, reason, error.message);

      if (previousQuote) {
        return {
          ...previousQuote,
          status: 'STALE',
          dataSource: 'Finnhub (Cached)',
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
        dataSource: 'Finnhub',
        status: 'ERROR',
        errorMessage: 'Network error communicating with Finnhub API',
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

    const resolved = this.resolveFinnhubSymbol(asset);

    try {
      this.registerRequest();

      const apiKey = this.getApiKey();
      const resolution = this.formatResolution(timeframe);
      const toTimestamp = Math.floor(Date.now() / 1000);
      const candleSeconds =
        timeframe === 'M5'
          ? 300
          : timeframe === 'M15'
          ? 900
          : timeframe === 'H1'
          ? 3600
          : timeframe === 'H4'
          ? 14400
          : 86400;

      const fromTimestamp = toTimestamp - Math.max(numberOfCandles, 50) * candleSeconds * 2;

      let candleEndpoint = 'stock/candle';
      if (resolved.endpointType === 'crypto') {
        candleEndpoint = 'crypto/candle';
      } else if (resolved.endpointType === 'forex') {
        candleEndpoint = 'forex/candle';
      }

      const url = `${this.baseUrl}/${candleEndpoint}?symbol=${encodeURIComponent(
        resolved.symbol
      )}&resolution=${resolution}&from=${fromTimestamp}&to=${toTimestamp}&token=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });

      if (res.status === 429) {
        this.handleRateLimitHit('HTTP 429 on candles request');
        return previousCandles || [];
      }

      if (res.status === 403 || res.status === 401) {
        return previousCandles || [];
      }

      if (!res.ok) {
        this.handleTransientFailure(res.status, 'SERVER_ERROR', `HTTP ${res.status}`);
        return previousCandles || [];
      }

      const data = await res.json();

      if (data.s !== 'ok' || !Array.isArray(data.t) || data.t.length === 0) {
        return previousCandles || [];
      }

      this.state = 'CONNECTED';
      this.lastSuccessTime = Date.now();
      this.consecutiveFailures = 0;

      const rawCandles: MarketCandle[] = [];
      for (let i = 0; i < data.t.length; i++) {
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

      let finalCandles = rawCandles;
      if (timeframe === 'H4' && rawCandles.length > 0) {
        finalCandles = this.aggregateCandles(rawCandles, 4, 'H4', asset.symbol);
      }

      const validated = validateMarketCandles(finalCandles, asset.symbol, timeframe, asset.assetClass);
      return validated.cleanCandles.slice(-numberOfCandles);
    } catch (err: any) {
      const isTimeout = err.name === 'AbortError' || err.name === 'TimeoutError' || err.message?.includes('timeout');
      const reason: ProviderErrorReason = isTimeout ? 'NETWORK_TIMEOUT' : 'SERVER_ERROR';
      this.handleTransientFailure(0, reason, err.message);
      return previousCandles || [];
    }
  }

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

  /**
   * Retrieves detailed SingleProviderStatus (Requirement 11)
   */
  public async getSingleStatus(): Promise<SingleProviderStatus> {
    const now = Date.now();
    const currentState = this.getState();
    const activeMinuteRequests = this.requestTimestamps.filter((t) => now - t < 60000).length;
    const cooldownRemainingSec = this.rateLimitCooldownUntil > now ? Math.ceil((this.rateLimitCooldownUntil - now) / 1000) : null;

    let legacyStatus: SingleProviderStatus['status'] = 'ONLINE';
    let message = 'Finnhub secondary live market data stream active';

    if (!this.isConfigured) {
      legacyStatus = 'UNCONFIGURED';
      message = 'FINNHUB_API_KEY is not configured in environment.';
    } else if (currentState === 'RATE_LIMITED') {
      legacyStatus = 'RATE_LIMITED';
      message = `Finnhub rate limit active (${cooldownRemainingSec || 0}s remaining).`;
    } else if (currentState === 'COOLDOWN') {
      legacyStatus = 'COOLDOWN';
      message = `Transient backoff active (${cooldownRemainingSec || 0}s remaining): ${this.lastErrorMessage || 'Retrying'}`;
    } else if (currentState === 'OFFLINE') {
      legacyStatus = 'OFFLINE';
      message = this.lastErrorMessage || 'Finnhub is offline or unauthenticated.';
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
        finnhub: single,
      },
      rateLimitStats: single.rateLimitStats,
    };
  }

  public async isSymbolSupported(asset: Asset): Promise<boolean> {
    const resolved = this.resolveFinnhubSymbol(asset);
    return Boolean(resolved.symbol);
  }
}
