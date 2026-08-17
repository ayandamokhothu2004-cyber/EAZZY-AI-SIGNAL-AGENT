import { MarketDataProvider } from './MarketDataProvider';
import { TwelveDataProvider } from './TwelveDataProvider';
import { FinnhubProvider } from './FinnhubProvider';
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

  // Cooldown duration: Base 30 seconds after Twelve Data fails with controlled exponential backoff
  private readonly BASE_PRIMARY_COOLDOWN_MS = 30000;
  private readonly MAX_PRIMARY_COOLDOWN_MS = 240000; // 4 minutes max backoff

  // In-flight deduplication and short TTL caching (Requirement 13 & 17G)
  private inFlightQuotes = new Map<string, Promise<MarketPrice>>();
  private cachedQuotes = new Map<string, { quote: MarketPrice; timestamp: number }>();
  private readonly QUOTE_CACHE_TTL_MS = 2500;

  constructor() {
    this.primaryProvider = new TwelveDataProvider();
    this.secondaryProvider = new FinnhubProvider();
  }

  /**
   * Logs structured provider event (Requirement 15)
   */
  private logProviderSwitch(oldProvider: string, newProvider: string, reason: string): void {
    console.log(
      `[PROVIDER SWITCH]\nold provider: ${oldProvider}\nnew provider: ${newProvider}\nreason: ${reason}\ntimestamp: ${new Date().toISOString()}`
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

    // Thresholds: FX/Commodities/Indices: >0.75% conflict, Crypto: >1.5% conflict
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
   * Includes in-flight deduplication and short TTL caching to prevent duplicate API requests.
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
            console.log(
              `[MARKET DATA RECOVERY] Twelve Data recovered successfully for ${asset.symbol}. Restoring primary provider.`
            );
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

        // If Twelve Data returned non-live status (RATE_LIMITED, STALE, UNAVAILABLE, ERROR)
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

    // STEP 2: Handle Twelve Data failure and initiate Failover to Finnhub with exponential backoff
    this.primaryFailureCount++;
    const backoffMultiplier = Math.min(Math.pow(2, Math.max(0, this.primaryFailureCount - 1)), 8);
    const cooldownDuration = Math.min(
      this.BASE_PRIMARY_COOLDOWN_MS * backoffMultiplier,
      this.MAX_PRIMARY_COOLDOWN_MS
    );
    this.primaryCooldownUntil = now + cooldownDuration;
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

          // Check consistency
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
   * Comprehensive Provider Status Diagnostic (Twelve Data + Finnhub + Failover matrix).
   */
  public async getProviderStatus(): Promise<ProviderStatusInfo> {
    const primaryStatus = await this.primaryProvider.getProviderStatus();
    const secondaryStatus = await this.secondaryProvider.getProviderStatus();

    const instrumentsHealth: Record<string, InstrumentProviderHealth> = {};
    const assets = this.getSupportedAssets();

    for (const asset of assets) {
      const activeProvider = this.lastActiveProviderBySymbol.get(asset.symbol) || 'Twelve Data';
      const lastErr = this.lastErrorsBySymbol.get(asset.symbol);
      const conflictInfo = this.activeConflictMap.get(asset.symbol);
      const priceRec = this.lastPricesBySymbol.get(asset.symbol);

      let status: 'LIVE' | 'FAILOVER' | 'DATA_CONFLICT' | 'UNAVAILABLE' | 'OFFLINE' | 'RATE_LIMITED' =
        'LIVE';

      if (conflictInfo?.conflict) {
        status = 'DATA_CONFLICT';
      } else if (activeProvider === 'Finnhub') {
        status = 'FAILOVER';
      } else if (primaryStatus.status === 'RATE_LIMITED') {
        status = 'RATE_LIMITED';
      } else if (!primaryStatus.configured && !secondaryStatus.configured) {
        status = 'UNAVAILABLE';
      }

      instrumentsHealth[asset.symbol] = {
        symbol: asset.symbol,
        primary: 'Twelve Data',
        secondary: 'Finnhub',
        activeProvider,
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

    const overallActive = this.primaryFailureCount > 0 ? 'Finnhub (Failover)' : 'Twelve Data';

    return {
      provider: 'Multi-Provider Failover (Twelve Data + Finnhub)',
      configured: primaryStatus.configured || secondaryStatus.configured,
      status:
        primaryStatus.status === 'ONLINE' || secondaryStatus.status === 'ONLINE'
          ? 'ONLINE'
          : primaryStatus.status === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : 'DEGRADED',
      message: `Active Provider: ${overallActive}. Failover ready.`,
      lastChecked: Date.now(),
      primary: {
        name: 'Twelve Data',
        configured: primaryStatus.configured,
        status: primaryStatus.status,
        message: primaryStatus.message,
        lastChecked: primaryStatus.lastChecked,
        rateLimitStats: primaryStatus.rateLimitStats,
      },
      secondary: {
        name: 'Finnhub',
        configured: secondaryStatus.configured,
        status: secondaryStatus.status,
        message: secondaryStatus.message,
        lastChecked: secondaryStatus.lastChecked,
        rateLimitStats: secondaryStatus.rateLimitStats,
      },
      activeProvider: overallActive,
      instruments: instrumentsHealth,
    };
  }

  /**
   * Retrieves the age of the latest market data in seconds for a symbol.
   */
  public getDataAgeSeconds(symbol: string): number {
    const asset = getAssetConfig(symbol);
    const symKey = asset ? asset.symbol : symbol;
    const lastTime = this.lastQuoteTimestamps.get(symKey);
    if (!lastTime) return 999;
    return Math.max(0, Math.floor((Date.now() - lastTime) / 1000));
  }

  /**
   * Checks whether the market data for a symbol is stale (older than STALE_THRESHOLD_MS).
   */
  public isDataStale(symbol: string, maxAgeMs: number = REFRESH_INTERVALS.STALE_THRESHOLD_MS): boolean {
    const asset = getAssetConfig(symbol);
    const symKey = asset ? asset.symbol : symbol;
    const lastTime = this.lastQuoteTimestamps.get(symKey);
    if (!lastTime) return false; // If not fetched yet, not flagged as stale
    return Date.now() - lastTime > maxAgeMs;
  }

  /**
   * Comprehensive Engine & Market Refresh Status (Requirement 1, 2, 8, 9, 12).
   */
  public async getEngineStatus(
    symbol: string = 'EURUSD',
    monitoredSignalsCount: number = 0,
    candlesByTF?: Record<Timeframe, MarketCandle[]>
  ): Promise<EngineStatus> {
    const asset = getAssetConfig(symbol);
    const symKey = asset ? asset.symbol : symbol;
    const now = Date.now();

    const lastTime = this.lastQuoteTimestamps.get(symKey) || now;
    const dataAgeSeconds = Math.max(0, Math.floor((now - lastTime) / 1000));

    const isCoolingDown = now < this.primaryCooldownUntil;
    const primaryStatus = await this.primaryProvider.getProviderStatus();
    const secondaryStatus = await this.secondaryProvider.getProviderStatus();

    const activeProvider = this.lastActiveProviderBySymbol.get(symKey) || (this.primaryFailureCount > 0 ? 'Finnhub' : 'Twelve Data');
    const backupProvider = activeProvider === 'Twelve Data' ? 'Finnhub' : 'Twelve Data';

    // Market feed state: LIVE, STALE, RECONNECTING, OFFLINE
    let marketFeed: ConnectionStatus = 'LIVE';
    if (!primaryStatus.configured && !secondaryStatus.configured) {
      marketFeed = 'OFFLINE';
    } else if (isCoolingDown && this.primaryFailureCount > 0 && activeProvider !== 'Finnhub') {
      marketFeed = 'RECONNECTING';
    } else if (this.isDataStale(symKey)) {
      marketFeed = 'STALE';
    } else if (activeProvider === 'None') {
      marketFeed = isCoolingDown ? 'RECONNECTING' : 'OFFLINE';
    }

    // Determine candle states for M5, M15, H1, H4
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

    // Scanner state: PAUSED if stale, otherwise ACTIVE
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
      signalsMonitoredCount,
      refreshIntervals: {
        quoteRefreshMs: REFRESH_INTERVALS.QUOTE_REFRESH_INTERVAL_MS,
        candleRefreshMs: REFRESH_INTERVALS.CANDLE_REFRESH_INTERVAL_MS,
        scanIntervalMs: REFRESH_INTERVALS.SCAN_INTERVAL_MS,
        staleThresholdMs: REFRESH_INTERVALS.STALE_THRESHOLD_MS,
      },
      providerHealth: {
        twelveData: isCoolingDown
          ? 'COOLDOWN'
          : primaryStatus.status === 'ONLINE'
          ? 'CONNECTED'
          : primaryStatus.status === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : 'DISCONNECTED',
        finnhub: secondaryStatus.status === 'ONLINE' ? 'CONNECTED' : secondaryStatus.status === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'DISCONNECTED',
      },
    };
  }
}

export const marketDataManager = new MarketDataManager();
