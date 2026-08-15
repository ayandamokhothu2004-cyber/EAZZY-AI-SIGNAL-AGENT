import {
  InstrumentConfig,
  MarketQuote,
  MarketPrice,
  MarketCandle,
  Timeframe,
  TradeType,
  Signal,
  PerformanceAnalytics,
  RiskSettings,
  ProviderStatusInfo,
} from '../types';

export const API = {
  async getInstruments(): Promise<InstrumentConfig[]> {
    const res = await fetch('/api/instruments');
    if (!res.ok) throw new Error('Failed to fetch instruments');
    const data = await res.json();
    return data.instruments;
  },

  async getProviderStatus(): Promise<ProviderStatusInfo> {
    const res = await fetch('/api/market/provider-status');
    if (!res.ok) throw new Error('Failed to fetch provider status');
    return res.json();
  },

  async getMarketOverview(): Promise<Record<string, MarketPrice>> {
    const res = await fetch('/api/market/overview');
    if (!res.ok) throw new Error('Failed to fetch market overview');
    const data = await res.json();
    return data.overview;
  },

  async getCryptoOverview(): Promise<{
    bitcoin: MarketPrice;
    ethereum: MarketPrice;
    solana: MarketPrice;
    allCrypto: MarketPrice[];
  }> {
    const res = await fetch('/api/market/crypto-overview');
    if (!res.ok) throw new Error('Failed to fetch crypto overview');
    return res.json();
  },

  async getQuote(symbol: string): Promise<{ quote: MarketPrice | MarketQuote; dataSource: string }> {
    const res = await fetch(`/api/market/quote/${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error(`Failed to fetch quote for ${symbol}`);
    return res.json();
  },

  async getCandles(
    symbol: string,
    timeframe: Timeframe = 'M15'
  ): Promise<{
    symbol: string;
    timeframe: Timeframe;
    candles: MarketCandle[];
    quote: MarketPrice | MarketQuote;
    dataSource: string;
    status?: string;
    errorMessage?: string;
  }> {
    const res = await fetch(`/api/market/candles/${encodeURIComponent(symbol)}?timeframe=${timeframe}`);
    if (!res.ok) throw new Error(`Failed to fetch candles for ${symbol}`);
    return res.json();
  },

  async scanSignal(
    symbol: string,
    tradeType: TradeType,
    riskSettings?: RiskSettings
  ): Promise<{ signal: Signal; quote: MarketQuote; dataSource: string }> {
    const res = await fetch('/api/signals/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, tradeType, riskSettings }),
    });
    if (!res.ok) throw new Error('Failed to run signal scan');
    return res.json();
  },

  async getJournal(): Promise<{ signals: Signal[]; totalCount: number }> {
    const res = await fetch('/api/signals/journal');
    if (!res.ok) throw new Error('Failed to fetch signal journal');
    return res.json();
  },

  async getPerformance(): Promise<PerformanceAnalytics> {
    const res = await fetch('/api/performance');
    if (!res.ok) throw new Error('Failed to fetch performance analytics');
    return res.json();
  },

  async trackerTick(
    symbol: string
  ): Promise<{
    symbol: string;
    price: number;
    trackingResult: { updatedCount: number; statusChanges: any[] };
    performance: PerformanceAnalytics;
  }> {
    const res = await fetch('/api/tracker/tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    if (!res.ok) throw new Error('Tracker tick failed');
    return res.json();
  },
};
