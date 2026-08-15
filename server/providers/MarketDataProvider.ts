import { Asset, MarketPrice, MarketCandle, Timeframe, ProviderStatusInfo } from '../../src/types';

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
   * Checks if a symbol is supported on the provider.
   */
  isSymbolSupported(asset: Asset): Promise<boolean>;
}
