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

interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
}

async function fetchJson<T>(
  url: string,
  options?: FetchJsonOptions,
  fallbackMessage = 'Request failed',
  maxRetries = 1
): Promise<T> {
  let attempt = 0;
  let lastError: any = null;
  const timeoutMs = options?.timeoutMs ?? (url.includes('/scan') || url.includes('/diagnostics') ? 60000 : 30000);

  while (attempt <= maxRetries) {
    let timeoutId: NodeJS.Timeout | number | null = null;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (controller) {
        timeoutId = setTimeout(() => {
          try {
            controller.abort();
          } catch {
            // ignore abort errors
          }
        }, timeoutMs);
      }

      const reqOptions: RequestInit = {
        ...options,
        signal: options?.signal || controller?.signal,
      };

      const res = await fetch(url, reqOptions);
      if (timeoutId) clearTimeout(timeoutId);

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
        } else {
          try {
            const text = await res.text();
            if (text && text.length < 200 && !text.includes('<!DOCTYPE')) {
              errorMsg = text;
            }
          } catch {
            // ignore
          }
        }
        // Only retry on 502, 503, 504 server errors
        if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries) {
          attempt++;
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          continue;
        }
        throw new Error(errorMsg);
      }

      if (contentType.includes('application/json')) {
        return await res.json();
      }

      // Try fallback parsing text as JSON if content-type header was omitted
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText})`);
      }
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = err;

      const isAbortOrTimeout =
        err.name === 'AbortError' ||
        err.name === 'TimeoutError' ||
        err.message?.includes('aborted') ||
        err.message?.includes('timeout');

      const isNetworkError =
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('NetworkError') ||
        err.message?.includes('ECONNRESET');

      if (attempt < maxRetries && (isAbortOrTimeout || isNetworkError)) {
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        continue;
      }

      const msg = isAbortOrTimeout
        ? `Request timed out after ${Math.round(timeoutMs / 1000)}s`
        : err.message || fallbackMessage;

      if (msg.includes(fallbackMessage)) {
        throw new Error(msg);
      }
      throw new Error(`${fallbackMessage}: ${msg}`);
    }
  }

  throw lastError || new Error(fallbackMessage);
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

  async reconnectProviders(): Promise<{ success: boolean; message: string; status: ProviderStatusInfo }> {
    return fetchJson<{ success: boolean; message: string; status: ProviderStatusInfo }>(
      '/api/market/reconnect',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      'Failed to reconnect providers'
    );
  },

  async runDiagnosticTestSuite(): Promise<{
    success: boolean;
    timestamp: string;
    providerStatus: ProviderStatusInfo;
    results: Record<string, any>;
  }> {
    return fetchJson<{
      success: boolean;
      timestamp: string;
      providerStatus: ProviderStatusInfo;
      results: Record<string, any>;
    }>(
      '/api/market/diagnostics/test-suite',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      'Failed to run diagnostic test suite'
    );
  },

  async getEngineStatus(symbol?: string): Promise<import('../types').EngineStatus> {
    return fetchJson<import('../types').EngineStatus>(
      `/api/market/engine-status${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}`,
      undefined,
      'Failed to fetch live engine status'
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
      `/api/market/quote?symbol=${encodeURIComponent(symbol)}`,
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
      `/api/market/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
      undefined,
      `Failed to fetch candles for ${symbol}`
    );
  },

  async getBacktestHistoricalCandles(
    symbol: string,
    timeframe: Timeframe = 'M15',
    limit = 200,
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
    const params = new URLSearchParams({
      symbol,
      timeframe,
      limit: String(limit),
    });
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    return fetchJson<{
      status: 'AVAILABLE' | 'UNAVAILABLE';
      symbol: string;
      timeframe: Timeframe;
      candles: MarketCandle[];
      dataSource: string;
      candleCount: number;
      startDate?: string;
      endDate?: string;
      errorMessage?: string;
      dataQuality?: any;
    }>(
      `/api/backtest/historical-candles?${params.toString()}`,
      undefined,
      `Failed to fetch backtest historical candles for ${symbol}`
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

  async getJournal(params?: {
    page?: number;
    limit?: number | 'all';
    status?: string;
    instrument?: string;
    strategy?: string;
    tradeType?: string;
    direction?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    tab?: 'ALL' | 'ACTIVE' | 'HISTORY';
  }): Promise<{
    signals: Signal[];
    totalCount: number;
    filteredCount?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    activeCount?: number;
    historyCount?: number;
    stats?: any;
    storage?: any;
  }> {
    const query = new URLSearchParams();
    if (params) {
      if (params.page !== undefined) query.set('page', String(params.page));
      if (params.limit !== undefined) query.set('limit', String(params.limit));
      if (params.status) query.set('status', params.status);
      if (params.instrument) query.set('instrument', params.instrument);
      if (params.strategy) query.set('strategy', params.strategy);
      if (params.tradeType) query.set('tradeType', params.tradeType);
      if (params.direction) query.set('direction', params.direction);
      if (params.search) query.set('search', params.search);
      if (params.startDate) query.set('startDate', params.startDate);
      if (params.endDate) query.set('endDate', params.endDate);
      if (params.sortBy) query.set('sortBy', params.sortBy);
      if (params.sortOrder) query.set('sortOrder', params.sortOrder);
      if (params.tab) query.set('tab', params.tab);
    }
    const qs = query.toString();
    return fetchJson<{
      signals: Signal[];
      totalCount: number;
      filteredCount?: number;
      page?: number;
      limit?: number;
      totalPages?: number;
      activeCount?: number;
      historyCount?: number;
      stats?: any;
      storage?: any;
    }>(
      `/api/signals/journal${qs ? `?${qs}` : ''}`,
      undefined,
      'Failed to fetch signal journal'
    );
  },

  async getSignalById(id: string): Promise<{ signal: Signal }> {
    return fetchJson<{ signal: Signal }>(
      `/api/signals/journal/${encodeURIComponent(id)}`,
      undefined,
      `Failed to fetch signal ${id}`
    );
  },

  async updateSignalStatus(
    id: string,
    status: string,
    options?: { outcomeR?: number; closedPrice?: number; closedReason?: string; force?: boolean }
  ): Promise<{ success: boolean; signal: Signal }> {
    return fetchJson<{ success: boolean; signal: Signal }>(
      `/api/signals/journal/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...options }),
      },
      `Failed to update signal status for ${id}`
    );
  },

  async getStorageStatus(): Promise<{ storage: any }> {
    return fetchJson<{ storage: any }>(
      '/api/signals/journal/storage-status',
      undefined,
      'Failed to fetch storage status'
    );
  },

  async resetJournal(seedHistorical = false): Promise<{ success: boolean; message: string }> {
    return fetchJson<{ success: boolean; message: string }>(
      '/api/signals/journal/reset',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedHistorical }),
      },
      'Failed to reset journal'
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
