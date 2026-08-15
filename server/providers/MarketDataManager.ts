import { MarketDataProvider } from './MarketDataProvider';
import { TwelveDataProvider } from './TwelveDataProvider';
import {
  Asset,
  AssetClass,
  MarketCandle,
  MarketPrice,
  MarketQuote,
  Timeframe,
  ProviderStatusInfo,
} from '../../src/types';
import {
  SUPPORTED_ASSETS,
  getAssetConfig,
  normalizeSymbolKey,
  getAssetMarketStatus,
} from '../config/assets';

export class MarketDataManager {
  private primaryProvider: MarketDataProvider;
  private fallbackProviders: MarketDataProvider[] = [];

  constructor() {
    this.primaryProvider = new TwelveDataProvider();
  }

  /**
   * Returns list of configured assets
   */
  public getSupportedAssets(): Asset[] {
    return SUPPORTED_ASSETS.filter((a) => a.enabled);
  }

  /**
   * Retrieves single asset config
   */
  public getAsset(symbol: string): Asset | undefined {
    return getAssetConfig(symbol);
  }

  /**
   * Retrieves normalized real market quote
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

    try {
      const quote = await this.primaryProvider.getQuote(asset);
      return quote;
    } catch (error: any) {
      console.error(`[MarketDataManager] Error getting quote for ${symbol}:`, error);
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
        dataSource: this.primaryProvider.name,
        status: 'ERROR',
        errorMessage: error.message || 'Failed to retrieve quote',
      };
    }
  }

  /**
   * Reusable market-data function: getHistoricalCandles()
   * Returns normalized OHLCV candle sequence
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

    // If instrument is completely unavailable
    if (quote.status === 'UNAVAILABLE') {
      return {
        symbol: asset.symbol,
        timeframe,
        candles: [],
        quote,
        dataSource: this.primaryProvider.name,
        status: 'UNAVAILABLE',
        errorMessage: 'DATA NOT AVAILABLE FROM CURRENT PROVIDER',
      };
    }

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
          dataSource: `${this.primaryProvider.name} (Direct Series)`,
          status: quote.status,
        };
      }

      // If candles are empty but price is live, generate synthetic fallback only if specifically needed for dev, clearly marked
      return {
        symbol: asset.symbol,
        timeframe,
        candles: [],
        quote,
        dataSource: this.primaryProvider.name,
        status: 'NO_CANDLES',
        errorMessage: `No historical candles returned for ${asset.symbol} on ${timeframe}`,
      };
    } catch (err: any) {
      console.error(`[MarketDataManager] Candle error for ${symbol}:`, err);
      return {
        symbol: asset.symbol,
        timeframe,
        candles: [],
        quote,
        dataSource: this.primaryProvider.name,
        status: 'ERROR',
        errorMessage: err.message,
      };
    }
  }

  /**
   * Retrieves overview quotes for all configured assets
   */
  public async getMarketOverview(): Promise<Record<string, MarketPrice>> {
    const assets = this.getSupportedAssets();
    const results: Record<string, MarketPrice> = {};

    // Parallel fetch with promise settling
    const promises = assets.map(async (asset) => {
      try {
        const quote = await this.primaryProvider.getQuote(asset);
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
          dataSource: this.primaryProvider.name,
          status: 'ERROR',
          errorMessage: err.message,
        };
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Retrieves crypto specific market watch data
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
   * Retrieves provider status diagnostic
   */
  public async getProviderStatus(): Promise<ProviderStatusInfo> {
    return this.primaryProvider.getProviderStatus();
  }
}

export const marketDataManager = new MarketDataManager();
