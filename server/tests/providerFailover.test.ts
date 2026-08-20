import { MarketDataManager } from '../providers/MarketDataManager';
import { MarketDataProvider } from '../providers/MarketDataProvider';
import { Asset, MarketPrice, MarketCandle, Timeframe, ProviderStatusInfo } from '../../src/types';

// Mock Provider Factory to simulate test scenarios A-G
class MockProvider implements MarketDataProvider {
  public name: string;
  public isConfigured: boolean;
  public quoteFn: (asset: Asset) => Promise<MarketPrice>;
  public candleFn: (asset: Asset, tf: Timeframe, n: number) => Promise<MarketCandle[]>;
  public callCount = 0;

  constructor(name: string, isConfigured = true) {
    this.name = name;
    this.isConfigured = isConfigured;
    this.quoteFn = async (asset: Asset) => ({
      symbol: asset.symbol,
      displayName: asset.displayName,
      assetClass: asset.assetClass,
      price: 1.085,
      high24h: 1.089,
      low24h: 1.082,
      change24h: 0.003,
      changePercent24h: 0.28,
      timestamp: Date.now(),
      lastUpdate: new Date().toISOString(),
      marketStatus: 'OPEN',
      dataSource: name,
      status: 'LIVE',
    });
    this.candleFn = async (asset: Asset, tf: Timeframe) => [
      {
        time: Date.now(),
        timestamp: Date.now(),
        open: 1.084,
        high: 1.086,
        low: 1.083,
        close: 1.085,
        volume: 5000,
        symbol: asset.symbol,
        timeframe: tf,
        source: name,
      },
    ];
  }

  async getQuote(asset: Asset): Promise<MarketPrice> {
    this.callCount++;
    return this.quoteFn(asset);
  }

  async getHistoricalCandles(asset: Asset, tf: Timeframe, n: number): Promise<MarketCandle[]> {
    this.callCount++;
    return this.candleFn(asset, tf, n);
  }

  async getProviderStatus(): Promise<ProviderStatusInfo> {
    const single = await this.getSingleStatus();
    return {
      provider: this.name,
      configured: this.isConfigured,
      activeProvider: this.name,
      marketFeed: 'LIVE',
      status: 'ONLINE',
      lastChecked: Date.now(),
      providers: {
        twelveData: single,
        finnhub: single,
      },
    };
  }

  async getSingleStatus(): Promise<import('../../src/types').SingleProviderStatus> {
    return {
      name: this.name,
      configured: this.isConfigured,
      state: 'CONNECTED',
      status: 'ONLINE',
      message: `${this.name} active`,
      lastChecked: Date.now(),
    };
  }

  async checkHealth(): Promise<import('../providers/MarketDataProvider').HealthCheckResult> {
    return {
      healthy: true,
      state: 'CONNECTED',
      latencyMs: 25,
      testedSymbol: 'BTC/USD',
      price: 68000,
      timestamp: Date.now(),
    };
  }

  resetCooldown(): void {
    // mock reset
  }

  async isSymbolSupported(_asset: Asset): Promise<boolean> {
    return true;
  }
}

async function runTestSuite() {
  console.log('======================================================================');
  console.log('🧪 RUNNING MARKET DATA PROVIDER FAILOVER & RECOVERY TEST SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string, detail?: string) => {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  };

  const testAsset: Asset = {
    symbol: 'EUR/USD',
    displayName: 'Euro / US Dollar',
    assetClass: 'FOREX',
    providerSymbol: 'EUR/USD',
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 0.0001,
    digits: 5,
    icon: '💶',
    description: 'Euro / US Dollar',
  };

  // TEST A: Twelve Data succeeds -> Twelve Data used as Primary
  {
    const manager = new MarketDataManager();
    const mockTwelve = new MockProvider('Twelve Data');
    const mockFinnhub = new MockProvider('Finnhub');
    (manager as any).primaryProvider = mockTwelve;
    (manager as any).secondaryProvider = mockFinnhub;

    const quote = await manager.getQuote('EUR/USD');
    assert(
      quote.dataSource === 'Twelve Data' && quote.status === 'LIVE' && quote.price === 1.085,
      'Test A: Twelve Data succeeds -> Twelve Data used as primary',
      `Got dataSource=${quote.dataSource}, status=${quote.status}, price=${quote.price}`
    );
    assert(
      mockTwelve.callCount === 1 && mockFinnhub.callCount === 0,
      'Test A (Isolation): Finnhub not polled when primary succeeds'
    );
  }

  // TEST B: Twelve Data fails, Finnhub succeeds -> Finnhub Failover used
  {
    const manager = new MarketDataManager();
    const mockTwelve = new MockProvider('Twelve Data');
    mockTwelve.quoteFn = async (asset: Asset) => {
      throw new Error('Twelve Data HTTP 504 Gateway Timeout');
    };

    const mockFinnhub = new MockProvider('Finnhub');
    mockFinnhub.quoteFn = async (asset: Asset) => ({
      symbol: asset.symbol,
      displayName: asset.displayName,
      assetClass: asset.assetClass,
      price: 1.0852,
      high24h: 1.089,
      low24h: 1.082,
      change24h: 0.0032,
      changePercent24h: 0.3,
      timestamp: Date.now(),
      lastUpdate: new Date().toISOString(),
      marketStatus: 'OPEN',
      dataSource: 'Finnhub',
      status: 'LIVE',
    });

    (manager as any).primaryProvider = mockTwelve;
    (manager as any).secondaryProvider = mockFinnhub;

    const quote = await manager.getQuote('EUR/USD');
    assert(
      quote.dataSource.includes('Finnhub') && quote.status === 'LIVE' && quote.price === 1.0852,
      'Test B: Twelve Data fails, Finnhub succeeds -> Failover to Finnhub used',
      `Got dataSource=${quote.dataSource}, price=${quote.price}`
    );
    assert(
      mockFinnhub.callCount === 1,
      'Test B: Finnhub was actively called as fallback'
    );
  }

  // TEST C: Both fail -> UNAVAILABLE / DATA NOT AVAILABLE (Zero synthetic data)
  {
    const manager = new MarketDataManager();
    const mockTwelve = new MockProvider('Twelve Data');
    mockTwelve.quoteFn = async () => {
      throw new Error('Twelve Data down');
    };
    const mockFinnhub = new MockProvider('Finnhub');
    mockFinnhub.quoteFn = async () => {
      throw new Error('Finnhub down');
    };

    (manager as any).primaryProvider = mockTwelve;
    (manager as any).secondaryProvider = mockFinnhub;

    const quote = await manager.getQuote('EUR/USD');
    assert(
      quote.status === 'UNAVAILABLE' && quote.price === 0,
      'Test C: Both providers fail -> Returns UNAVAILABLE without generating fake data',
      `Got status=${quote.status}, price=${quote.price}`
    );
  }

  // TEST D: Twelve Data rate limited / stale -> Finnhub attempted
  {
    const manager = new MarketDataManager();
    const mockTwelve = new MockProvider('Twelve Data');
    mockTwelve.quoteFn = async (asset: Asset) => ({
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
      marketStatus: 'OPEN',
      dataSource: 'Twelve Data',
      status: 'RATE_LIMITED',
      errorMessage: 'MARKET DATA API LIMIT REACHED',
    });

    const mockFinnhub = new MockProvider('Finnhub');
    mockFinnhub.quoteFn = async (asset: Asset) => ({
      symbol: asset.symbol,
      displayName: asset.displayName,
      assetClass: asset.assetClass,
      price: 1.0848,
      high24h: 1.088,
      low24h: 1.081,
      change24h: 0.0028,
      changePercent24h: 0.26,
      timestamp: Date.now(),
      lastUpdate: new Date().toISOString(),
      marketStatus: 'OPEN',
      dataSource: 'Finnhub',
      status: 'LIVE',
    });

    (manager as any).primaryProvider = mockTwelve;
    (manager as any).secondaryProvider = mockFinnhub;

    const quote = await manager.getQuote('EUR/USD');
    assert(
      quote.dataSource.includes('Finnhub') && quote.status === 'LIVE' && quote.price === 1.0848,
      'Test D: Twelve Data rate-limited -> Finnhub successfully attempted',
      `Got dataSource=${quote.dataSource}, status=${quote.status}`
    );
  }

  // TEST E: Both providers disagree significantly -> DATA CONFLICT
  {
    const manager = new MarketDataManager();
    // Simulate Twelve Data price = 1.0850, Finnhub price = 1.1200 (diff > 3%)
    (manager as any).lastPricesBySymbol.set('EUR/USD', {
      twelvePrice: 1.085,
      twelveTime: Date.now(),
      finnhubPrice: 1.12,
      finnhubTime: Date.now(),
    });

    const consistency = manager.checkDataConsistency('EUR/USD');
    assert(
      consistency.conflict === true && consistency.agreement === 'DATA_CONFLICT',
      'Test E: Both providers disagree significantly -> DATA CONFLICT flagged',
      `Got conflict=${consistency.conflict}, diff=${consistency.diffPercent?.toFixed(2)}%`
    );
  }

  // TEST F: Twelve Data recovers -> Twelve Data becomes primary again
  {
    const manager = new MarketDataManager();
    const mockTwelve = new MockProvider('Twelve Data');
    let failMode = true;
    mockTwelve.quoteFn = async (asset: Asset) => {
      if (failMode) {
        throw new Error('Temporary outage');
      }
      return {
        symbol: asset.symbol,
        displayName: asset.displayName,
        assetClass: asset.assetClass,
        price: 1.0855,
        high24h: 1.089,
        low24h: 1.082,
        change24h: 0.0035,
        changePercent24h: 0.32,
        timestamp: Date.now(),
        lastUpdate: new Date().toISOString(),
        marketStatus: 'OPEN',
        dataSource: 'Twelve Data',
        status: 'LIVE',
      };
    };

    const mockFinnhub = new MockProvider('Finnhub');
    (manager as any).primaryProvider = mockTwelve;
    (manager as any).secondaryProvider = mockFinnhub;

    // First call: Twelve Data fails -> Finnhub used
    const failoverQuote = await manager.getQuote('EUR/USD');
    assert(
      failoverQuote.dataSource.includes('Finnhub'),
      'Test F (Step 1): Initial Twelve Data failure triggers Finnhub failover'
    );

    // Recovery: Twelve Data comes back online, cooldown expires
    failMode = false;
    (manager as any).primaryCooldownUntil = 0; // Cooldown elapsed
    (manager as any).cachedQuotes.clear(); // Cache expired after cooldown period

    const recoveredQuote = await manager.getQuote('EUR/USD');
    assert(
      recoveredQuote.dataSource === 'Twelve Data' && recoveredQuote.price === 1.0855,
      'Test F (Step 2): Twelve Data recovers -> Cleanly restored as Primary provider',
      `Got dataSource=${recoveredQuote.dataSource}, price=${recoveredQuote.price}`
    );
  }

  // TEST G: In-flight Deduplication & Cache
  {
    const mockTwelve = new MockProvider('Twelve Data');
    const manager = new MarketDataManager();
    (manager as any).primaryProvider = mockTwelve;

    // Fire 5 concurrent quote requests for same symbol
    await Promise.all([
      manager.getQuote('EUR/USD'),
      manager.getQuote('EUR/USD'),
      manager.getQuote('EUR/USD'),
      manager.getQuote('EUR/USD'),
      manager.getQuote('EUR/USD'),
    ]);

    assert(
      mockTwelve.callCount === 1,
      'Test G: Concurrent duplicate requests coalesced into single provider call',
      `Expected callCount=1, got callCount=${mockTwelve.callCount}`
    );
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`📊 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('----------------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
