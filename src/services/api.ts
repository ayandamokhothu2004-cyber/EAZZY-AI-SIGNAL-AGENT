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

async function fetchJson<T>(url: string, options?: RequestInit, fallbackMessage = 'Request failed'): Promise<T> {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let errorMsg = `${fallbackMessage} (${res.status})`;
    if (contentType.includes('application/json')) {
      try {
        const json = await res.json();
        errorMsg = json.error || json.message || errorMsg;
      } catch {
        // ignore json parse error on error responses
      }
    }
    throw new Error(errorMsg);
  }

  if (!contentType.includes('application/json')) {
    throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText})`);
  }

  return res.json();
}

export const API = {
  async getInstruments(): Promise<InstrumentConfig[]> {
    const data = await fetchJson<{ instruments: InstrumentConfig[] }>(
      '/api/instruments',
      undefined,
      'Failed to fetch instruments'
    );
    return data.instruments || [];
  },

  async getProviderStatus(): Promise<ProviderStatusInfo> {
    return fetchJson<ProviderStatusInfo>(
      '/api/market/provider-status',
      undefined,
      'Failed to fetch provider status'
    );
  },

  async getMarketOverview(): Promise<Record<string, MarketPrice>> {
    const data = await fetchJson<{ overview: Record<string, MarketPrice> }>(
      '/api/market/overview',
      undefined,
      'Failed to fetch market overview'
    );
    return data.overview || {};
  },

  async getCryptoOverview(): Promise<{
    bitcoin: MarketPrice;
    ethereum: MarketPrice;
    solana: MarketPrice;
    allCrypto: MarketPrice[];
  }> {
    return fetchJson<{
      bitcoin: MarketPrice;
      ethereum: MarketPrice;
      solana: MarketPrice;
      allCrypto: MarketPrice[];
    }>('/api/market/crypto-overview', undefined, 'Failed to fetch crypto overview');
  },

  async getQuote(symbol: string): Promise<{ quote: MarketPrice | MarketQuote; dataSource: string }> {
    return fetchJson<{ quote: MarketPrice | MarketQuote; dataSource: string }>(
      `/api/market/quote/${encodeURIComponent(symbol)}`,
      undefined,
      `Failed to fetch quote for ${symbol}`
    );
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
    return fetchJson<{
      symbol: string;
      timeframe: Timeframe;
      candles: MarketCandle[];
      quote: MarketPrice | MarketQuote;
      dataSource: string;
      status?: string;
      errorMessage?: string;
    }>(
      `/api/market/candles/${encodeURIComponent(symbol)}?timeframe=${timeframe}`,
      undefined,
      `Failed to fetch candles for ${symbol}`
    );
  },

  async scanSignal(
    symbol: string,
    tradeType: TradeType,
    riskSettings?: RiskSettings
  ): Promise<{ signal: Signal; quote: MarketQuote; dataSource: string }> {
    return fetchJson<{ signal: Signal; quote: MarketQuote; dataSource: string }>(
      '/api/signals/scan',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, tradeType, riskSettings }),
      },
      'Failed to run signal scan'
    );
  },

  async getJournal(): Promise<{ signals: Signal[]; totalCount: number }> {
    return fetchJson<{ signals: Signal[]; totalCount: number }>(
      '/api/signals/journal',
      undefined,
      'Failed to fetch signal journal'
    );
  },

  async getPerformance(): Promise<PerformanceAnalytics> {
    return fetchJson<PerformanceAnalytics>(
      '/api/performance',
      undefined,
      'Failed to fetch performance analytics'
    );
  },

  async trackerTick(
    symbol: string
  ): Promise<{
    symbol: string;
    price: number;
    trackingResult: { updatedCount: number; statusChanges: any[] };
    performance: PerformanceAnalytics;
  }> {
    return fetchJson<{
      symbol: string;
      price: number;
      trackingResult: { updatedCount: number; statusChanges: any[] };
      performance: PerformanceAnalytics;
    }>(
      '/api/tracker/tick',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      },
      'Tracker tick failed'
    );
  },
};
