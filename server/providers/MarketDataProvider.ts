import {
  Asset,
  MarketPrice,
  MarketCandle,
  Timeframe,
  ProviderStatusInfo,
  SingleProviderStatus,
  ProviderState,
} from '../../src/types';

export interface HealthCheckResult {
  healthy: boolean;
  state: ProviderState;
  latencyMs: number;
  testedSymbol: string;
  price?: number;
  timestamp?: number;
  errorReason?: string;
}

export interface MarketDataProvider {
  readonly name: string;
  readonly isConfigured: boolean;

  /**
   * Retrieves the latest real-time or cached price quote for an asset.
   */
  getQuote(asset: Asset): Promise<MarketPrice>;

  /**
   * Retrieves validated historical OHLCV candles for an asset and timeframe.
   */
  getHistoricalCandles(
    asset: Asset,
    timeframe: Timeframe,
    numberOfCandles: number
  ): Promise<MarketCandle[]>;

  /**
   * Retrieves provider status, rate limit metrics, and health diagnostics.
   */
  getProviderStatus(): Promise<ProviderStatusInfo>;

  /**
   * Retrieves detailed single provider status.
   */
  getSingleStatus(): Promise<SingleProviderStatus>;

  /**
   * Performs an active, lightweight health check against the live API.
   */
  checkHealth(): Promise<HealthCheckResult>;

  /**
   * Manually resets cooldown and rate limit timestamps.
   */
  resetCooldown(): void;

  /**
   * Checks if a symbol is supported on the provider.
   */
  isSymbolSupported(asset: Asset): Promise<boolean>;
}
