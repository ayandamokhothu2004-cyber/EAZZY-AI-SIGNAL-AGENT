import { MarketDataProvider } from './MarketDataProvider';
import { TwelveDataProvider } from './TwelveDataProvider';
import { FinnhubProvider } from './FinnhubProvider';
import { validateHistoricalDataset } from '../../src/backtest/dataValidator';
import {
  Asset,
  AssetClass,
  MarketCandle,
  MarketPrice,
  Timeframe,
  ProviderStatusInfo,
  SingleProviderStatus,
  InstrumentProviderHealth,
  CandleState,
  EngineStatus,
  ConnectionStatus,
  ProviderState,
} from '../../src/types';
import {
  SUPPORTED_ASSETS,
  getAssetConfig,
  normalizeSymbolKey,
  getAssetMarketStatus,
} from '../config/assets';
import {
  REFRESH_INTERVALS,
  getCandleState,
  TIMEFRAME_DURATIONS_MS,
} from '../config/intervals';

interface PriceRecord {
  twelvePrice?: number;
  twelveTime?: number;
  finnhubPrice?: number;
  finnhubTime?: number;
}

export class MarketDataManager {
  private primaryProvider: TwelveDataProvider;
  private secondaryProvider: FinnhubProvider;

  // Failover and recovery state tracking
  private primaryFailureCount = 0;
  private primaryCooldownUntil = 0;
  private lastActiveProviderBySymbol = new Map<string, string>();
  private lastErrorsBySymbol = new Map<string, string>();
  private lastPricesBySymbol = new Map<string, PriceRecord>();
  private lastQuoteTimestamps = new Map<string, number>();
  private activeConflictMap = new Map<
    string,
    { conflict: boolean; reason: string; diffPercent: number; twelvePrice: number; finnhubPrice: number }
  >();

  // Cooldown duration: Base 30 seconds after Twelve Data fails with controlled exponential backoff (30s, 60s, 120s, 240s max)
  private readonly BASE_PRIMARY_COOLDOWN_MS = 30000;
  private readonly MAX_PRIMARY_COOLDOWN_MS = 240000; // 240 seconds max backoff

  // In-flight deduplication and short TTL caching
  private inFlightQuotes = new Map<string, Promise<MarketPrice>>();
  private cachedQuotes = new Map<string, { quote: MarketPrice; timestamp: number }>();
  private readonly QUOTE_CACHE_TTL_MS = 3000; // 3-second cache TTL

  constructor() {
    this.primaryProvider = new TwelveDataProvider();
    this.secondaryProvider = new FinnhubProvider();
  }

  /**
   * Logs structured provider event (Requirement 6 & 14)
   */
  private logProviderSwitch(oldProvider: string, newProvider: string, reason: string): void {
    console.log(
      `[PROVIDER SWITCH]\nold provider: ${oldProvider}\nnew provider: ${newProvider}\nreason: ${reason}\ntimestamp: ${new Date().toISOString()}`
    );
  }

  /**
   * Logs structured provider recovery (Requirement 14)
   */
  private logProviderRecovery(provider: string, previousState: string, newState: string): void {
    console.log(
      `[MARKET DATA RECOVERY]\nprovider: ${provider}\ntimestamp: ${new Date().toISOString()}\nprevious state: ${previousState}\nnew state: ${newState}`
    );
  }

  /**
   * Resets internal cache and failover state (useful for test isolation)
   */
  public resetState(): void {
    this.primaryFailureCount = 0;
    this.primaryCooldownUntil = 0;
    this.lastActiveProviderBySymbol.clear();
    this.lastErrorsBySymbol.clear();
    this.lastPricesBySymbol.clear();
    this.lastQuoteTimestamps.clear();
    this.activeConflictMap.clear();
    this.inFlightQuotes.clear();
    this.cachedQuotes.clear();
    this.primaryProvider.resetCooldown();
    this.secondaryProvider.resetCooldown();
  }

  /**
   * Returns list of configured assets.
   */
  public getSupportedAssets(): Asset[] {
    return SUPPORTED_ASSETS.filter((a) => a.enabled);
  }

  /**
   * Retrieves single asset config.
   */
  public getAsset(symbol: string): Asset | undefined {
    return getAssetConfig(symbol);
  }

  /**
   * Retrieves primary provider instance.
   */
  public getPrimaryProvider(): TwelveDataProvider {
    return this.primaryProvider;
  }

  /**
   * Retrieves secondary provider instance.
   */
  public getSecondaryProvider(): FinnhubProvider {
    return this.secondaryProvider;
  }

  /**
   * Checks whether Twelve Data is currently in cooldown or healthy.
   */
  public isPrimaryInCooldown(): boolean {
    return Date.now() < this.primaryCooldownUntil;
  }

  /**
   * Checks price consistency between Twelve Data and Finnhub for an asset.
   */
  public checkDataConsistency(symbol: string): {
    conflict: boolean;
    reason?: string;
    diffPercent?: number;
    twelvePrice?: number;
    finnhubPrice?: number;
    agreement?: 'HIGH' | 'MODERATE' | 'DATA_CONFLICT';
  } {
    const asset = getAssetConfig(symbol);
    if (!asset) return { conflict: false };

    const record = this.lastPricesBySymbol.get(asset.symbol);
    if (!record || !record.twelvePrice || !record.finnhubPrice) {
      return { conflict: false };
    }

    const now = Date.now();
    // Compare only if both quotes were recorded in the last 2 minutes
    if (
      (!record.twelveTime || now - record.twelveTime > 120000) ||
      (!record.finnhubTime || now - record.finnhubTime > 120000)
    ) {
      return { conflict: false };
    }

    const twelve = record.twelvePrice;
    const finn = record.finnhubPrice;
    const avg = (twelve + finn) / 2;
    if (avg <= 0) return { conflict: false };

    const diff = Math.abs(twelve - finn);
    const diffPercent = (diff / avg) * 100;

    const conflictThreshold = asset.assetClass === 'CRYPTO' ? 1.5 : 0.75;
    const moderateThreshold = asset.assetClass === 'CRYPTO' ? 0.8 : 0.35;

    let agreement: 'HIGH' | 'MODERATE' | 'DATA_CONFLICT' = 'HIGH';
    if (diffPercent > conflictThreshold) {
      agreement = 'DATA_CONFLICT';
      const reason = `Market data providers disagree: Twelve Data ($${twelve.toFixed(
        asset.digits
      )}) vs Finnhub ($${finn.toFixed(asset.digits)}), diff: ${diffPercent.toFixed(2)}%`;

      this.activeConflictMap.set(asset.symbol, {
        conflict: true,
        reason,
        diffPercent,
        twelvePrice: twelve,
        finnhubPrice: finn,
      });

      return {
        conflict: true,
        reason,
        diffPercent,
        twelvePrice: twelve,
        finnhubPrice: finn,
        agreement: 'DATA_CONFLICT',
      };
    } else if (diffPercent > moderateThreshold) {
      agreement = 'MODERATE';
    }

    this.activeConflictMap.delete(asset.symbol);
    return {
      conflict: false,
      diffPercent,
      twelvePrice: twelve,
      finnhubPrice: finn,
      agreement,
    };
  }

  /**
   * Retrieves quote with Primary (Twelve Data) -> Secondary (Finnhub) failover.
   */
  public async getQuote(symbol: string): Promise<MarketPrice> {
    const asset = getAssetConfig(symbol);

    if (!asset) {
      return {
        symbol,
        displayName: symbol,
        assetClass: 'FOREX',
        price: 0,
        high24h: 0,
        low24h: 0,
        change24h: 0,
        changePercent24h: 0,
        timestamp: Date.now(),
        lastUpdate: new Date().toISOString(),
        marketStatus: 'CLOSED',
        dataSource: 'None',
        status: 'UNAVAILABLE',
        errorMessage: `Instrument ${symbol} is not configured in asset registry.`,
      };
    }

    const cacheKey = asset.symbol;
    const now = Date.now();

    // Check short TTL cache
    const cached = this.cachedQuotes.get(cacheKey);
    if (cached && now - cached.timestamp < this.QUOTE_CACHE_TTL_MS && cached.quote.price > 0) {
      return cached.quote;
    }

    // In-flight coalescing
    const inFlight = this.inFlightQuotes.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const fetchPromise = this.fetchQuoteInternal(asset, now);
    this.inFlightQuotes.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      if (result.price > 0 && result.status !== 'UNAVAILABLE') {
        this.cachedQuotes.set(cacheKey, { quote: result, timestamp: Date.now() });
      }
      return result;
    } finally {
      this.inFlightQuotes.delete(cacheKey);
    }
  }

  private async fetchQuoteInternal(asset: Asset, now: number): Promise<MarketPrice> {
    const isTwelveDataCoolingDown = now < this.primaryCooldownUntil;
    const previousActive = this.lastActiveProviderBySymbol.get(asset.symbol);

    let primaryQuote: MarketPrice | null = null;
    let primaryError: string | null = null;

    // STEP 1: Attempt Primary Provider (Twelve Data) if not in active failure cooldown
    if (!isTwelveDataCoolingDown) {
      try {
        primaryQuote = await this.primaryProvider.getQuote(asset);

        // Store Twelve Data price record if valid
        if (primaryQuote.price > 0) {
          const rec = this.lastPricesBySymbol.get(asset.symbol) || {};
          rec.twelvePrice = primaryQuote.price;
          rec.twelveTime = primaryQuote.timestamp;
          this.lastPricesBySymbol.set(asset.symbol, rec);
          this.lastQuoteTimestamps.set(asset.symbol, primaryQuote.timestamp || now);
        }

        // If Twelve Data returned a healthy LIVE quote
        if (primaryQuote.status === 'LIVE' && primaryQuote.price > 0) {
          // Recovery: Reset failure state on success
          if (this.primaryFailureCount > 0 || previousActive === 'Finnhub') {
            this.logProviderRecovery('Twelve Data', 'COOLDOWN', 'CONNECTED');
            this.logProviderSwitch(
              previousActive || 'Finnhub',
              'Twelve Data',
              'Twelve Data health recovery'
            );
            this.primaryFailureCount = 0;
            this.primaryCooldownUntil = 0;
          }

          this.lastActiveProviderBySymbol.set(asset.symbol, 'Twelve Data');
          this.lastErrorsBySymbol.delete(asset.symbol);

          // Check consistency in background if Finnhub price is known
          const consistency = this.checkDataConsistency(asset.symbol);
          if (consistency.conflict) {
            return {
              ...primaryQuote,
              status: 'DATA_CONFLICT',
              errorMessage: consistency.reason,
            };
          }

          return primaryQuote;
        }

        primaryError =
          primaryQuote.errorMessage || `Twelve Data status: ${primaryQuote.status}`;
      } catch (err: any) {
        primaryError = err.message || 'Twelve Data network exception';
      }
    } else {
      primaryError = `Twelve Data cooldown active (${Math.ceil(
        (this.primaryCooldownUntil - now) / 1000
      )}s remaining)`;
    }

    // STEP 2: Initiate Failover to Finnhub
    // Apply short exponential backoff for Twelve Data (5s, 10s, 20s, 30s, 60s max)
    if (!isTwelveDataCoolingDown) {
      this.primaryFailureCount++;
      const backoffSec = Math.min(60, Math.max(5, 5 * Math.pow(2, this.primaryFailureCount - 1)));
      this.primaryCooldownUntil = now + backoffSec * 1000;
    }
    this.lastErrorsBySymbol.set(asset.symbol, primaryError || 'Primary failed');

    // Attempt Finnhub as Secondary / Fallback provider
    if (this.secondaryProvider.isConfigured) {
      try {
        console.log(
          `[MARKET DATA]\n${asset.symbol}\nPrimary: Twelve Data\nStatus: ${
            primaryError || 'TIMEOUT / ERROR'
          }\nFallback: Finnhub\nActive provider: Finnhub`
        );

        if (previousActive !== 'Finnhub') {
          this.logProviderSwitch(
            previousActive || 'Twelve Data',
            'Finnhub',
            `Twelve Data failure: ${primaryError || 'Unresponsive'}`
          );
        }

        const finnhubQuote = await this.secondaryProvider.getQuote(asset);

        if (finnhubQuote.price > 0) {
          const rec = this.lastPricesBySymbol.get(asset.symbol) || {};
          rec.finnhubPrice = finnhubQuote.price;
          rec.finnhubTime = finnhubQuote.timestamp;
          this.lastPricesBySymbol.set(asset.symbol, rec);
          this.lastQuoteTimestamps.set(asset.symbol, finnhubQuote.timestamp || now);
        }

        if (finnhubQuote.status === 'LIVE' && finnhubQuote.price > 0) {
          this.lastActiveProviderBySymbol.set(asset.symbol, 'Finnhub');
          console.log(
            `[MARKET DATA]\n${asset.symbol}\nPrimary: Twelve Data\nFallback: Finnhub\nStatus: SUCCESS\nActive provider: Finnhub`
          );

          const consistency = this.checkDataConsistency(asset.symbol);
          if (consistency.conflict) {
            return {
              ...finnhubQuote,
              dataSource: 'Finnhub (Failover)',
              status: 'DATA_CONFLICT',
              errorMessage: consistency.reason,
            };
          }

          return {
            ...finnhubQuote,
            dataSource: 'Finnhub (Failover)',
            status: 'LIVE',
          };
        }
      } catch (finnErr: any) {
        console.warn(`[MARKET DATA] Finnhub fallback error for ${asset.symbol}:`, finnErr.message);
      }
    }

    // If Twelve Data had returned a STALE or cached quote, prefer that over total blank
    if (primaryQuote && primaryQuote.price > 0) {
      this.lastActiveProviderBySymbol.set(asset.symbol, 'Twelve Data');
      return primaryQuote;
    }

    // STEP 3: Both providers failed or unavailable
    if (previousActive && previousActive !== 'None') {
      this.logProviderSwitch(previousActive, 'None', 'All market providers unavailable');
    }
    this.lastActiveProviderBySymbol.set(asset.symbol, 'None');
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
      marketStatus: getAssetMarketStatus(asset.assetClass),
      dataSource: 'None',
      status: 'UNAVAILABLE',
      errorMessage: `DATA NOT AVAILABLE FROM CURRENT PROVIDERS (Twelve Data: ${primaryError || 'Unavailable'})`,
    };
  }

  /**
   * Retrieves market overview for all configured instruments.
   */
  public async getMarketOverview(): Promise<Record<string, MarketPrice>> {
    const assets = this.getSupportedAssets();
    const results: Record<string, MarketPrice> = {};

    const promises = assets.map(async (asset) => {
      try {
        const quote = await this.getQuote(asset.symbol);
        results[asset.symbol] = quote;
      } catch (err: any) {
        results[asset.symbol] = {
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
          marketStatus: getAssetMarketStatus(asset.assetClass),
          dataSource: 'None',
          status: 'ERROR',
          errorMessage: err.message,
        };
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Retrieves crypto specific market watch data.
   */
  public async getCryptoMarketWatch(): Promise<{
    bitcoin: MarketPrice;
    ethereum: MarketPrice;
    solana: MarketPrice;
    allCrypto: MarketPrice[];
  }> {
    const btc = await this.getQuote('BTC/USD');
    const eth = await this.getQuote('ETH/USD');
    const sol = await this.getQuote('SOL/USD');

    return {
      bitcoin: btc,
      ethereum: eth,
      solana: sol,
      allCrypto: [btc, eth, sol],
    };
  }

  /**
   * Retrieves historical candles with Twelve Data -> Finnhub failover.
   */
  public async getHistoricalCandles(
    symbol: string,
    timeframe: Timeframe = 'M15',
    numberOfCandles = 100
  ): Promise<{
    symbol: string;
    timeframe: Timeframe;
    candles: MarketCandle[];
    quote: MarketPrice;
    dataSource: string;
    status: string;
    errorMessage?: string;
  }> {
    const asset = getAssetConfig(symbol) || {
      symbol,
      displayName: symbol,
      assetClass: 'FOREX' as AssetClass,
      providerSymbol: symbol,
      enabled: true,
      supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
      provider: 'TWELVE_DATA',
      pipSize: 0.0001,
      digits: 5,
      icon: '📊',
      description: 'Asset',
    };

    const quote = await this.getQuote(symbol);

    if (quote.status === 'UNAVAILABLE' && quote.price === 0) {
      return {
        symbol: asset.symbol,
        timeframe,
        candles: [],
        quote,
        dataSource: 'None',
        status: 'UNAVAILABLE',
        errorMessage: 'DATA NOT AVAILABLE FROM CURRENT PROVIDERS',
      };
    }

    const now = Date.now();
    const isTwelveDataCoolingDown = now < this.primaryCooldownUntil;

    // STEP 1: Attempt Primary Provider (Twelve Data) candles
    if (!isTwelveDataCoolingDown) {
      try {
        const candles = await this.primaryProvider.getHistoricalCandles(
          asset,
          timeframe,
          numberOfCandles
        );

        if (candles.length > 0) {
          return {
            symbol: asset.symbol,
            timeframe,
            candles,
            quote,
            dataSource: 'Twelve Data',
            status: quote.status,
          };
        }
      } catch (err: any) {
        console.warn(`[MarketDataManager] Twelve Data candles failed for ${symbol}:`, err.message);
      }
    }

    // STEP 2: Attempt Fallback Provider (Finnhub) candles
    if (this.secondaryProvider.isConfigured) {
      try {
        const finnCandles = await this.secondaryProvider.getHistoricalCandles(
          asset,
          timeframe,
          numberOfCandles
        );

        if (finnCandles.length > 0) {
          console.log(
            `[MARKET DATA] ${asset.symbol} Candles: Using Finnhub failover (${finnCandles.length} ${timeframe} candles).`
          );
          return {
            symbol: asset.symbol,
            timeframe,
            candles: finnCandles,
            quote,
            dataSource: 'Finnhub (Failover)',
            status: 'LIVE',
          };
        }
      } catch (finnErr: any) {
        console.warn(`[MarketDataManager] Finnhub candles failed for ${symbol}:`, finnErr.message);
      }
    }

    // STEP 3: No candles returned from either provider
    return {
      symbol: asset.symbol,
      timeframe,
      candles: [],
      quote,
      dataSource: quote.dataSource || 'None',
      status: 'NO_CANDLES',
      errorMessage: `No historical candles returned for ${asset.symbol} on ${timeframe} from available providers`,
    };
  }

  /**
   * Dedicated backtest candle loader: fetches real historical OHLCV data from Twelve Data / Finnhub
   */
  public async getBacktestHistoricalCandles(
    symbol: string,
    timeframe: Timeframe = 'M15',
    numberOfCandles = 200,
    startDate?: string,
    endDate?: string
  ): Promise<{
    status: 'AVAILABLE' | 'UNAVAILABLE';
    symbol: string;
    timeframe: Timeframe;
    candles: MarketCandle[];
    dataSource: string;
    candleCount: number;
    startDate?: string;
    endDate?: string;
    errorMessage?: string;
    dataQuality?: {
      isValid: boolean;
      totalCandles: number;
      duplicateCount: number;
      outOfOrderCount: number;
      zeroOrNaNCandles: number;
      invalidGeometryCount: number;
      gapsDetected: number;
      warnings: string[];
      errors: string[];
    };
  }> {
    const asset = getAssetConfig(symbol) || {
      symbol,
      displayName: symbol,
      assetClass: 'FOREX' as AssetClass,
      providerSymbol: symbol,
      enabled: true,
      supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
      provider: 'TWELVE_DATA',
      pipSize: 0.0001,
      digits: 5,
      icon: '📊',
      description: 'Asset',
    };

    let candles: MarketCandle[] = [];
    let dataSource = 'None';
    let errorMessage: string | undefined;

    const now = Date.now();
    const isTwelveDataCoolingDown = now < this.primaryCooldownUntil;

    // 1. Primary: Twelve Data
    if (this.primaryProvider.isConfigured && !isTwelveDataCoolingDown) {
      try {
        const primaryCandles = await this.primaryProvider.getHistoricalCandles(
          asset,
          timeframe,
          Math.min(500, Math.max(30, numberOfCandles))
        );
        if (primaryCandles && primaryCandles.length > 0) {
          candles = primaryCandles;
          dataSource = 'Twelve Data';
        }
      } catch (err: any) {
        errorMessage = `Twelve Data: ${err.message}`;
      }
    }

    // 2. Secondary: Finnhub fallback
    if (candles.length === 0 && this.secondaryProvider.isConfigured) {
      try {
        const secondaryCandles = await this.secondaryProvider.getHistoricalCandles(
          asset,
          timeframe,
          Math.min(500, Math.max(30, numberOfCandles))
        );
        if (secondaryCandles && secondaryCandles.length > 0) {
          candles = secondaryCandles;
          dataSource = 'Finnhub';
        }
      } catch (err: any) {
        errorMessage = (errorMessage ? errorMessage + ' | ' : '') + `Finnhub: ${err.message}`;
      }
    }

    // Filter by date range if provided
    if (candles.length > 0 && (startDate || endDate)) {
      const startMs = startDate ? new Date(startDate).getTime() : 0;
      const endMs = endDate ? new Date(endDate).getTime() : Infinity;
      candles = candles.filter((c) => {
        const t = c.timestamp || c.time || 0;
        return t >= startMs && t <= endMs;
      });
    }

    if (candles.length === 0) {
      const reason =
        !this.primaryProvider.isConfigured && !this.secondaryProvider.isConfigured
          ? 'No market data provider API keys configured (TWELVE_DATA_API_KEY / FINNHUB_API_KEY required for live downloads)'
          : errorMessage || `No real historical candles returned for ${symbol} on ${timeframe} from configured provider tiers`;

      return {
        status: 'UNAVAILABLE',
        symbol: asset.symbol,
        timeframe,
        candles: [],
        dataSource: 'None',
        candleCount: 0,
        errorMessage: `HISTORICAL DATA UNAVAILABLE: ${reason}`,
      };
    }

    // Run deep validation
    const validation = validateHistoricalDataset(candles, timeframe);

    if (!validation.report.isValid || validation.cleanCandles.length === 0) {
      return {
        status: 'UNAVAILABLE',
        symbol: asset.symbol,
        timeframe,
        candles: [],
        dataSource,
        candleCount: 0,
        errorMessage: `HISTORICAL DATA UNAVAILABLE: Provider data quality check failed (${validation.report.errors.join('; ')})`,
        dataQuality: validation.report,
      };
    }

    const clean = validation.cleanCandles;
    return {
      status: 'AVAILABLE',
      symbol: asset.symbol,
      timeframe,
      candles: clean,
      dataSource,
      candleCount: clean.length,
      startDate: new Date(clean[0].timestamp || clean[0].time).toISOString(),
      endDate: new Date(clean[clean.length - 1].timestamp || clean[clean.length - 1].time).toISOString(),
      dataQuality: validation.report,
    };
  }

  /**
   * Performs active health checks on both providers (Requirement 5)
   */
  public async performHealthChecks(): Promise<{
    twelveData: any;
    finnhub: any;
    activeProvider: string;
    marketFeed: string;
  }> {
    const [tdHealth, fhHealth] = await Promise.all([
      this.primaryProvider.checkHealth(),
      this.secondaryProvider.checkHealth(),
    ]);

    if (tdHealth.healthy) {
      this.primaryFailureCount = 0;
      this.primaryCooldownUntil = 0;
    }

    const twelveSingle = await this.primaryProvider.getSingleStatus();
    twelveSingle.healthCheckResult = tdHealth;

    const finnhubSingle = await this.secondaryProvider.getSingleStatus();
    finnhubSingle.healthCheckResult = fhHealth;

    let activeProvider = 'Twelve Data';
    let marketFeed = 'LIVE';

    if (tdHealth.healthy) {
      activeProvider = 'Twelve Data';
      marketFeed = 'LIVE';
    } else if (fhHealth.healthy) {
      activeProvider = 'Finnhub';
      marketFeed = 'FAILOVER';
    } else if (twelveSingle.state === 'RATE_LIMITED') {
      activeProvider = 'None';
      marketFeed = 'COOLDOWN';
    } else {
      activeProvider = 'None';
      marketFeed = 'NONE';
    }

    return {
      twelveData: twelveSingle,
      finnhub: finnhubSingle,
      activeProvider,
      marketFeed,
    };
  }

  /**
   * Manual Reconnect Handler (Requirement 13)
   */
  public async reconnect(): Promise<ProviderStatusInfo> {
    console.log('[MarketDataManager] Manual reconnect initiated by user.');
    this.primaryProvider.resetCooldown();
    this.secondaryProvider.resetCooldown();
    this.primaryFailureCount = 0;
    this.primaryCooldownUntil = 0;
    this.cachedQuotes.clear();

    await this.performHealthChecks();
    return this.getProviderStatus();
  }

  /**
   * Comprehensive Provider Status Diagnostic returning Section 11 format (Requirement 11).
   */
  public async getProviderStatus(): Promise<ProviderStatusInfo> {
    let twelveSingle = await this.primaryProvider.getSingleStatus();
    let finnhubSingle = await this.secondaryProvider.getSingleStatus();

    // In serverless cold-start or initial boot, run active health check if state is still unverified (DISCONNECTED)
    if (
      (twelveSingle.state === 'DISCONNECTED' && twelveSingle.configured) ||
      (finnhubSingle.state === 'DISCONNECTED' && finnhubSingle.configured)
    ) {
      await this.performHealthChecks();
      twelveSingle = await this.primaryProvider.getSingleStatus();
      finnhubSingle = await this.secondaryProvider.getSingleStatus();
    }

    const isTwelveDataCoolingDown = Date.now() < this.primaryCooldownUntil;

    let activeProvider = 'Twelve Data';
    let marketFeed: ProviderStatusInfo['marketFeed'] = 'LIVE';
    let marketFeedReason: string | undefined;

    if (twelveSingle.state === 'CONNECTED' && !isTwelveDataCoolingDown) {
      activeProvider = 'Twelve Data';
      marketFeed = 'LIVE';
    } else if (finnhubSingle.state === 'CONNECTED') {
      activeProvider = 'Finnhub';
      marketFeed = 'FAILOVER';
      marketFeedReason = `Primary provider Twelve Data is in ${twelveSingle.state}; using Finnhub failover.`;
    } else if (twelveSingle.state === 'RATE_LIMITED' || twelveSingle.state === 'COOLDOWN') {
      activeProvider = 'None';
      marketFeed = 'COOLDOWN';
      marketFeedReason = twelveSingle.message;
    } else if (twelveSingle.configured || finnhubSingle.configured) {
      activeProvider = 'None';
      marketFeed = 'NONE';
      marketFeedReason = `Twelve Data: ${twelveSingle.state} (${twelveSingle.lastError || 'N/A'}); Finnhub: ${finnhubSingle.state} (${finnhubSingle.lastError || 'N/A'})`;
    } else {
      activeProvider = 'None';
      marketFeed = 'OFFLINE';
      marketFeedReason = 'No market data provider API keys configured in environment.';
    }

    const instrumentsHealth: Record<string, InstrumentProviderHealth> = {};
    const assets = this.getSupportedAssets();

    for (const asset of assets) {
      const active = this.lastActiveProviderBySymbol.get(asset.symbol) || activeProvider;
      const lastErr = this.lastErrorsBySymbol.get(asset.symbol);
      const conflictInfo = this.activeConflictMap.get(asset.symbol);
      const priceRec = this.lastPricesBySymbol.get(asset.symbol);

      let status: InstrumentProviderHealth['status'] = 'LIVE';
      if (conflictInfo?.conflict) {
        status = 'DATA_CONFLICT';
      } else if (active === 'Finnhub') {
        status = 'FAILOVER';
      } else if (twelveSingle.state === 'RATE_LIMITED') {
        status = 'RATE_LIMITED';
      } else if (active === 'None') {
        status = 'UNAVAILABLE';
      }

      instrumentsHealth[asset.symbol] = {
        symbol: asset.symbol,
        primary: 'Twelve Data',
        secondary: 'Finnhub',
        activeProvider: active,
        status,
        reason: conflictInfo?.reason || lastErr,
        twelveDataPrice: priceRec?.twelvePrice,
        finnhubPrice: priceRec?.finnhubPrice,
        priceDifference:
          priceRec?.twelvePrice && priceRec?.finnhubPrice
            ? Math.abs(priceRec.twelvePrice - priceRec.finnhubPrice)
            : undefined,
        priceDifferencePercent: conflictInfo?.diffPercent,
        dataAgreement: conflictInfo?.conflict
          ? 'DATA_CONFLICT'
          : priceRec?.twelvePrice && priceRec?.finnhubPrice
          ? 'HIGH'
          : undefined,
        lastChecked: Date.now(),
      };
    }

    return {
      provider: 'Multi-Provider Failover (Twelve Data + Finnhub)',
      configured: twelveSingle.configured || finnhubSingle.configured,
      activeProvider,
      marketFeed,
      marketFeedReason,
      status:
        marketFeed === 'LIVE' || marketFeed === 'FAILOVER'
          ? 'ONLINE'
          : marketFeed === 'COOLDOWN'
          ? 'RATE_LIMITED'
          : 'DEGRADED',
      message: `Active Provider: ${activeProvider}. Feed: ${marketFeed}.`,
      lastChecked: Date.now(),
      providers: {
        twelveData: twelveSingle,
        finnhub: finnhubSingle,
      },
      primary: twelveSingle,
      secondary: finnhubSingle,
      rateLimitStats: twelveSingle.rateLimitStats,
      instruments: instrumentsHealth,
    };
  }

  public getDataAgeSeconds(symbol: string): number {
    const asset = getAssetConfig(symbol);
    const symKey = asset ? asset.symbol : symbol;
    const lastTime = this.lastQuoteTimestamps.get(symKey);
    if (!lastTime) return 999;
    return Math.max(0, Math.floor((Date.now() - lastTime) / 1000));
  }

  public isDataStale(symbol: string, maxAgeMs: number = REFRESH_INTERVALS.STALE_THRESHOLD_MS): boolean {
    const asset = getAssetConfig(symbol);
    const symKey = asset ? asset.symbol : symbol;
    const lastTime = this.lastQuoteTimestamps.get(symKey);
    if (!lastTime) return false;
    return Date.now() - lastTime > maxAgeMs;
  }

  public recordQuoteTimestamp(symbol: string, timestamp: number = Date.now()): void {
    const asset = getAssetConfig(symbol);
    const symKey = asset ? asset.symbol : symbol;
    this.lastQuoteTimestamps.set(symKey, timestamp);
  }

  public handlePrimaryFailure(symbol: string, error: string): void {
    this.primaryFailureCount++;
    const backoffMultiplier = Math.min(Math.pow(2, Math.max(0, this.primaryFailureCount - 1)), 8);
    const cooldownDuration = Math.min(
      this.BASE_PRIMARY_COOLDOWN_MS * backoffMultiplier,
      this.MAX_PRIMARY_COOLDOWN_MS
    );
    this.primaryCooldownUntil = Date.now() + cooldownDuration;
    this.lastErrorsBySymbol.set(symbol, error);
    this.lastActiveProviderBySymbol.set(symbol, 'Finnhub');
  }

  public handlePrimarySuccess(symbol: string): void {
    this.primaryFailureCount = 0;
    this.primaryCooldownUntil = 0;
    this.lastActiveProviderBySymbol.set(symbol, 'Twelve Data');
  }

  public getPrimaryCooldownDuration(): number {
    const backoffMultiplier = Math.min(Math.pow(2, Math.max(0, this.primaryFailureCount - 1)), 8);
    return Math.min(
      this.BASE_PRIMARY_COOLDOWN_MS * backoffMultiplier,
      this.MAX_PRIMARY_COOLDOWN_MS
    );
  }

  public getPrimaryFailureCount(): number {
    return this.primaryFailureCount;
  }

  public async getEngineStatus(
    symbol: string = 'EURUSD',
    monitoredSignalsCount: number = 0,
    candlesByTF?: Record<Timeframe, MarketCandle[]>
  ): Promise<EngineStatus> {
    const asset = getAssetConfig(symbol);
    const symKey = asset ? asset.symbol : symbol;
    const now = Date.now();

    const hasTick = this.lastQuoteTimestamps.has(symKey);
    const lastTime = this.lastQuoteTimestamps.get(symKey) || (hasTick ? now : 0);
    const dataAgeSeconds = lastTime > 0 ? Math.max(0, Math.floor((now - lastTime) / 1000)) : 999;

    const isCoolingDown = now < this.primaryCooldownUntil;
    const twelveSingle = await this.primaryProvider.getSingleStatus();
    const finnhubSingle = await this.secondaryProvider.getSingleStatus();

    const activeProvider = this.lastActiveProviderBySymbol.get(symKey) || (this.primaryFailureCount > 0 ? 'Finnhub' : 'Twelve Data');
    const backupProvider = activeProvider === 'Twelve Data' ? 'Finnhub' : 'Twelve Data';

    let marketFeed: ConnectionStatus = 'LIVE';
    if (!twelveSingle.configured && !finnhubSingle.configured) {
      marketFeed = 'OFFLINE';
    } else if (!hasTick) {
      marketFeed = activeProvider === 'None' ? 'OFFLINE' : 'RECONNECTING';
    } else if (isCoolingDown && this.primaryFailureCount > 0 && activeProvider !== 'Finnhub') {
      marketFeed = 'RECONNECTING';
    } else if (this.isDataStale(symKey)) {
      marketFeed = 'STALE';
    } else if (activeProvider === 'None') {
      marketFeed = isCoolingDown ? 'RECONNECTING' : 'OFFLINE';
    }

    const candleStates: Record<Timeframe, CandleState> = {
      M5: 'UNAVAILABLE',
      M15: 'UNAVAILABLE',
      H1: 'UNAVAILABLE',
      H4: 'UNAVAILABLE',
      D1: 'UNAVAILABLE',
    };

    const tfList: Timeframe[] = ['M5', 'M15', 'H1', 'H4', 'D1'];
    for (const tf of tfList) {
      const candles = candlesByTF ? candlesByTF[tf] : undefined;
      const latestCandle = candles && candles.length > 0 ? candles[candles.length - 1] : undefined;
      candleStates[tf] = getCandleState(latestCandle?.time, tf, now);
    }

    const isStale = marketFeed === 'STALE' || marketFeed === 'OFFLINE';
    const scannerStatus = isStale ? 'PAUSED' : 'ACTIVE';
    const pauseReason = isStale
      ? 'STALE DATA — SIGNAL GENERATION PAUSED'
      : undefined;

    return {
      marketFeed,
      activeProvider,
      backupProvider,
      lastTickTimestamp: lastTime,
      lastTickAgeSeconds: dataAgeSeconds,
      scannerStatus,
      pauseReason,
      nextScanSeconds: Math.ceil(REFRESH_INTERVALS.SCAN_INTERVAL_MS / 1000),
      candleStates,
      signalsMonitoredCount: monitoredSignalsCount,
      refreshIntervals: {
        quoteRefreshMs: REFRESH_INTERVALS.QUOTE_REFRESH_INTERVAL_MS,
        candleRefreshMs: REFRESH_INTERVALS.CANDLE_REFRESH_INTERVAL_MS,
        scanIntervalMs: REFRESH_INTERVALS.SCAN_INTERVAL_MS,
        staleThresholdMs: REFRESH_INTERVALS.STALE_THRESHOLD_MS,
      },
      providerHealth: {
        twelveData: isCoolingDown
          ? 'COOLDOWN'
          : twelveSingle.state === 'CONNECTED'
          ? 'CONNECTED'
          : twelveSingle.state === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : 'DISCONNECTED',
        finnhub:
          finnhubSingle.state === 'CONNECTED'
            ? 'CONNECTED'
            : finnhubSingle.state === 'RATE_LIMITED'
            ? 'RATE_LIMITED'
            : 'DISCONNECTED',
      },
    };
  }
}

export const marketDataManager = new MarketDataManager();
