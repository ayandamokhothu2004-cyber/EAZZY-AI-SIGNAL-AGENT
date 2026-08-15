import { Asset, AssetClass, Timeframe } from '../../src/types';

export const SUPPORTED_ASSETS: Asset[] = [
  // FOREX
  {
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
    description: 'Major FX pair representing the Eurozone and United States economies.',
  },
  {
    symbol: 'GBP/USD',
    displayName: 'British Pound / US Dollar',
    assetClass: 'FOREX',
    providerSymbol: 'GBP/USD',
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 0.0001,
    digits: 5,
    icon: '💷',
    description: 'Major FX pair (Cable) tracking the British Pound against the US Dollar.',
  },
  {
    symbol: 'USD/JPY',
    displayName: 'US Dollar / Japanese Yen',
    assetClass: 'FOREX',
    providerSymbol: 'USD/JPY',
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 0.01,
    digits: 3,
    icon: '💴',
    description: 'Major Asian session currency pair reflecting global risk sentiment.',
  },
  {
    symbol: 'AUD/USD',
    displayName: 'Australian Dollar / US Dollar',
    assetClass: 'FOREX',
    providerSymbol: 'AUD/USD',
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 0.0001,
    digits: 5,
    icon: '🇦🇺',
    description: 'High-beta commodity currency pair closely tied to global raw material demand.',
  },

  // CRYPTO (24/7 Continuous Market)
  {
    symbol: 'BTC/USD',
    displayName: 'Bitcoin',
    assetClass: 'CRYPTO',
    providerSymbol: 'BTC/USD',
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 1.0,
    digits: 2,
    icon: '₿',
    description: 'Benchmark decentralized digital store of value and market leader.',
  },
  {
    symbol: 'ETH/USD',
    displayName: 'Ethereum',
    assetClass: 'CRYPTO',
    providerSymbol: 'ETH/USD',
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 0.1,
    digits: 2,
    icon: 'Ξ',
    description: 'Primary programmable smart contract and decentralized application ecosystem.',
  },
  {
    symbol: 'SOL/USD',
    displayName: 'Solana',
    assetClass: 'CRYPTO',
    providerSymbol: 'SOL/USD',
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 0.01,
    digits: 2,
    icon: '◎',
    description: 'High-throughput layer-1 blockchain for high-speed decentralized finance.',
  },

  // COMMODITIES
  {
    symbol: 'XAU/USD',
    displayName: 'Gold / US Dollar',
    assetClass: 'COMMODITIES',
    providerSymbol: 'XAU/USD',
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 0.1,
    digits: 2,
    icon: '🥇',
    description: 'Spot Gold precious metal safe haven and monetary inflation hedge.',
  },
  {
    symbol: 'XAG/USD',
    displayName: 'Silver / US Dollar',
    assetClass: 'COMMODITIES',
    providerSymbol: 'XAG/USD',
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 0.01,
    digits: 3,
    icon: '🥈',
    description: 'Spot Silver industrial and monetary precious metal.',
  },

  // INDICES
  {
    symbol: 'NAS100',
    displayName: 'Nasdaq 100 Index',
    assetClass: 'INDICES',
    providerSymbol: 'QQQ', // Twelve data free tier provides ETF equivalents or direct indices if plan permits
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 1.0,
    digits: 2,
    icon: '📈',
    description: 'Top 100 non-financial tech and growth equities index (tracked via Invesco QQQ / NDX).',
  },
  {
    symbol: 'SPX500',
    displayName: 'S&P 500 Index',
    assetClass: 'INDICES',
    providerSymbol: 'SPY',
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 0.5,
    digits: 2,
    icon: '📊',
    description: 'Standard & Poor 500 benchmark broad-market equity index (tracked via SPY / SPX).',
  },
  {
    symbol: 'US30',
    displayName: 'Dow Jones Industrial 30',
    assetClass: 'INDICES',
    providerSymbol: 'DIA',
    enabled: true,
    supportedTimeframes: ['M5', 'M15', 'H1', 'H4', 'D1'],
    provider: 'TWELVE_DATA',
    pipSize: 1.0,
    digits: 2,
    icon: '🏛️',
    description: 'Dow Jones Industrial Average 30 blue-chip equities (tracked via DIA / DJI).',
  },
];

/**
 * Normalizes input symbol strings (e.g. 'EURUSD' -> 'EUR/USD', 'BTCUSD' -> 'BTC/USD')
 */
export function normalizeSymbolKey(rawSymbol: string): string {
  if (!rawSymbol) return 'EUR/USD';
  const clean = rawSymbol.trim().toUpperCase().replace(/[-_]/g, '/');

  // If already contains slash
  if (clean.includes('/')) {
    return clean;
  }

  // Common pairs without slash
  if (clean === 'EURUSD') return 'EUR/USD';
  if (clean === 'GBPUSD') return 'GBP/USD';
  if (clean === 'USDJPY') return 'USD/JPY';
  if (clean === 'AUDUSD') return 'AUD/USD';
  if (clean === 'BTCUSD') return 'BTC/USD';
  if (clean === 'ETHUSD') return 'ETH/USD';
  if (clean === 'SOLUSD') return 'SOL/USD';
  if (clean === 'XAUUSD') return 'XAU/USD';
  if (clean === 'XAGUSD') return 'XAG/USD';
  if (clean === 'US100') return 'NAS100';
  if (clean === 'US500') return 'SPX500';

  return clean;
}

/**
 * Finds asset configuration by symbol or normalized symbol
 */
export function getAssetConfig(symbol: string): Asset | undefined {
  const norm = normalizeSymbolKey(symbol);
  return SUPPORTED_ASSETS.find(
    (a) =>
      a.symbol.toUpperCase() === norm ||
      a.symbol.replace('/', '').toUpperCase() === symbol.toUpperCase() ||
      a.providerSymbol.toUpperCase() === symbol.toUpperCase()
  );
}

/**
 * Returns market session status aware of asset class (Crypto is 24/7, Forex has weekend close)
 */
export function getAssetMarketStatus(assetClass: AssetClass): 'OPEN' | 'CLOSED' | 'WEEKEND' {
  if (assetClass === 'CRYPTO') {
    return 'OPEN'; // Crypto trades 24/7 continuous
  }

  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sun, 6 = Sat
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  if (assetClass === 'FOREX' || assetClass === 'COMMODITIES') {
    // Forex closes Friday 22:00 UTC and opens Sunday 21:00 UTC
    if (day === 6) return 'WEEKEND';
    if (day === 5 && hour >= 22) return 'WEEKEND';
    if (day === 0 && (hour < 21 || (hour === 21 && minute < 0))) return 'WEEKEND';
    return 'OPEN';
  }

  if (assetClass === 'INDICES' || assetClass === 'STOCKS') {
    // US Stock Market hours (14:30 UTC to 21:00 UTC Mon-Fri)
    if (day === 0 || day === 6) return 'CLOSED';
    if (hour < 13 || hour >= 21) return 'CLOSED';
    return 'OPEN';
  }

  return 'OPEN';
}
