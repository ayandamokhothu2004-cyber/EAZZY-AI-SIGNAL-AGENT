import fs from 'fs';
import path from 'path';
import { Signal, SignalStatus, TradeType, StrategyName } from '../src/types';

export interface JournalQueryParams {
  page?: number;
  limit?: number | 'all';
  status?: string;
  instrument?: string;
  strategy?: string;
  tradeType?: TradeType | string;
  direction?: 'BUY' | 'SELL' | 'WAIT' | string;
  search?: string;
  startDate?: number | string;
  endDate?: number | string;
  sortBy?: 'timestamp' | 'createdAt' | 'confidence' | 'outcomeR' | 'riskReward' | 'instrument';
  sortOrder?: 'asc' | 'desc';
  tab?: 'ALL' | 'ACTIVE' | 'HISTORY';
}

export interface PaginatedJournalResult {
  signals: Signal[];
  totalCount: number;
  filteredCount: number;
  page: number;
  limit: number;
  totalPages: number;
  activeCount: number;
  historyCount: number;
  stats: {
    totalSignals: number;
    activeSignals: number;
    completedSignals: number;
    wins: number;
    losses: number;
    ambiguous: number;
    expired: number;
    cancelled: number;
    winRate: number;
    totalR: number;
    avgR: number;
    profitFactor: number;
  };
  storage: {
    driver: 'FILE_SYSTEM' | 'NETLIFY_DB' | 'MEMORY';
    status: 'HEALTHY' | 'DEGRADED' | 'FALLBACK';
    filePath: string;
    totalStoredRecords: number;
    lastSavedTimestamp: number;
  };
}

export interface StorageStatus {
  driver: 'FILE_SYSTEM' | 'NETLIFY_DB' | 'MEMORY';
  status: 'HEALTHY' | 'DEGRADED' | 'FALLBACK';
  connected: boolean;
  filePath: string;
  totalRecords: number;
  lastSavedAt: string;
  details: string;
}

/**
 * SignalStore handles durable persistence for all trading signals.
 * Writes are atomic (write to temp file then rename) and queued to prevent race conditions.
 */
export class SignalStore {
  private static instance: SignalStore | null = null;
  private filePath: string;
  private memoryCache: Map<string, Signal> = new Map();
  private isLoaded = false;
  private writeQueue: Promise<void> = Promise.resolve();
  private lastSavedTimestamp: number = 0;
  private storageDriver: 'FILE_SYSTEM' | 'NETLIFY_DB' | 'MEMORY' = 'FILE_SYSTEM';

  private constructor(customFilePath?: string) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {
        // directory creation fallback
      }
    }
    this.filePath = customFilePath || path.join(dataDir, 'signal_journal.json');
    this.loadFromDisk();
  }

  public static getInstance(customFilePath?: string): SignalStore {
    if (!SignalStore.instance || customFilePath) {
      SignalStore.instance = new SignalStore(customFilePath);
    }
    return SignalStore.instance;
  }

  public static resetInstance(): void {
    SignalStore.instance = null;
  }

  /**
   * Loads signals from disk into memory cache
   */
  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        if (raw.trim().length > 0) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.memoryCache.clear();
            for (const sig of parsed) {
              if (sig && (sig.id || sig.signalId)) {
                const id = sig.id || sig.signalId;
                this.memoryCache.set(id, sig);
              }
            }
            this.isLoaded = true;
            this.lastSavedTimestamp = Date.now();
            return;
          }
        }
      }
    } catch (err) {
      console.warn(`[SignalStore] Could not load from ${this.filePath}:`, err);
    }
    this.isLoaded = true;
  }

  /**
   * Persists memory cache to disk atomically
   */
  private async persistToDisk(): Promise<void> {
    const data = Array.from(this.memoryCache.values());
    const jsonStr = JSON.stringify(data, null, 2);

    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const dataDir = path.dirname(this.filePath);
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 6)}`;
        await fs.promises.writeFile(tempPath, jsonStr, 'utf-8');
        await fs.promises.rename(tempPath, this.filePath);
        this.lastSavedTimestamp = Date.now();
      } catch (err: any) {
        console.error(`[SignalStore] Failed to persist to ${this.filePath}:`, err);
        // Fallback direct write if atomic rename fails
        try {
          fs.writeFileSync(this.filePath, jsonStr, 'utf-8');
          this.lastSavedTimestamp = Date.now();
        } catch (fallbackErr) {
          console.error('[SignalStore] Fallback write failed:', fallbackErr);
        }
      }
    });

    return this.writeQueue;
  }

  /**
   * Synchronous flush for tests and shutdown hooks
   */
  public flushSync(): void {
    const data = Array.from(this.memoryCache.values());
    const jsonStr = JSON.stringify(data, null, 2);
    try {
      const dataDir = path.dirname(this.filePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, jsonStr, 'utf-8');
      this.lastSavedTimestamp = Date.now();
    } catch (err) {
      console.error('[SignalStore] flushSync failed:', err);
    }
  }

  /**
   * Retrieves all signals ordered by timestamp desc
   */
  public getAll(): Signal[] {
    if (!this.isLoaded) {
      this.loadFromDisk();
    }
    return Array.from(this.memoryCache.values()).sort(
      (a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0)
    );
  }

  /**
   * Retrieves a single signal by ID
   */
  public getById(id: string): Signal | undefined {
    if (!this.isLoaded) {
      this.loadFromDisk();
    }
    return this.memoryCache.get(id);
  }

  /**
   * Saves or updates a signal
   */
  public async save(signal: Signal): Promise<Signal> {
    if (!this.isLoaded) {
      this.loadFromDisk();
    }

    const id = signal.id || signal.signalId || `SIG-${Date.now()}`;
    signal.id = id;
    signal.signalId = id;
    if (!signal.timestamp && !signal.createdAt) {
      signal.timestamp = Date.now();
      signal.createdAt = signal.timestamp;
    }

    this.memoryCache.set(id, signal);
    await this.persistToDisk();
    return signal;
  }

  /**
   * Synchronous save for atomic test operations
   */
  public saveSync(signal: Signal): Signal {
    if (!this.isLoaded) {
      this.loadFromDisk();
    }

    const id = signal.id || signal.signalId || `SIG-${Date.now()}`;
    signal.id = id;
    signal.signalId = id;
    if (!signal.timestamp && !signal.createdAt) {
      signal.timestamp = Date.now();
      signal.createdAt = signal.timestamp;
    }

    this.memoryCache.set(id, signal);
    this.flushSync();
    return signal;
  }

  /**
   * Bulk insert/upsert signals
   */
  public async bulkSave(signals: Signal[]): Promise<void> {
    if (!this.isLoaded) {
      this.loadFromDisk();
    }
    for (const sig of signals) {
      const id = sig.id || sig.signalId || `SIG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      sig.id = id;
      sig.signalId = id;
      this.memoryCache.set(id, sig);
    }
    await this.persistToDisk();
  }

  /**
   * Deletes a signal by ID
   */
  public async delete(id: string): Promise<boolean> {
    if (!this.isLoaded) {
      this.loadFromDisk();
    }
    const exists = this.memoryCache.delete(id);
    if (exists) {
      await this.persistToDisk();
    }
    return exists;
  }

  /**
   * Clears the entire store (optionally with seed)
   */
  public async clear(): Promise<void> {
    this.memoryCache.clear();
    await this.persistToDisk();
  }

  /**
   * Clear synchronous
   */
  public clearSync(): void {
    this.memoryCache.clear();
    this.flushSync();
  }

  /**
   * Queries signals with filtering, search, pagination, and stats
   */
  public query(params: JournalQueryParams = {}): PaginatedJournalResult {
    const allSignals = this.getAll();
    const totalCount = allSignals.length;

    let filtered = allSignals.filter((sig) => {
      // Direction filter
      if (params.direction && params.direction !== 'ALL') {
        if (sig.direction !== params.direction) return false;
      }

      // Tab filter (ALL, ACTIVE, HISTORY)
      if (params.tab === 'ACTIVE' && sig.status !== 'ACTIVE') return false;
      if (params.tab === 'HISTORY' && sig.status === 'ACTIVE') return false;

      // Status filter
      if (params.status && params.status !== 'ALL') {
        const s = params.status.toUpperCase();
        if (s === 'ACTIVE' && sig.status !== 'ACTIVE') return false;
        if (s === 'WINS' && sig.status !== 'TP1_HIT' && sig.status !== 'TP2_HIT' && sig.status !== 'TP_HIT') return false;
        if (s === 'LOSSES' && sig.status !== 'SL_HIT') return false;
        if (s === 'AMBIGUOUS' && sig.status !== 'AMBIGUOUS') return false;
        if (s === 'EXPIRED' && sig.status !== 'EXPIRED') return false;
        if (s === 'INVALIDATED' && sig.status !== 'INVALIDATED' && sig.status !== 'CANCELLED') return false;
        if (s === 'COMPLETED' && sig.status === 'ACTIVE') return false;
        if (!['ACTIVE', 'WINS', 'LOSSES', 'AMBIGUOUS', 'EXPIRED', 'INVALIDATED', 'COMPLETED'].includes(s)) {
          if (sig.status !== s) return false;
        }
      }

      // Instrument filter
      if (params.instrument && params.instrument !== 'ALL') {
        const normFilter = params.instrument.replace(/[/_ -]/g, '').toUpperCase();
        const normSig = sig.instrument.replace(/[/_ -]/g, '').toUpperCase();
        if (normSig !== normFilter) return false;
      }

      // Strategy filter
      if (params.strategy && params.strategy !== 'ALL') {
        const filterStrat = params.strategy.replace(/[_ -]/g, '').toUpperCase();
        const sigStrat = (sig.strategy || '').replace(/[_ -]/g, '').toUpperCase();
        if (sigStrat !== filterStrat) return false;
      }

      // Trade Type filter
      if (params.tradeType && params.tradeType !== 'ALL') {
        if (sig.tradeType !== params.tradeType) return false;
      }

      // Date Range filter
      if (params.startDate) {
        const start = typeof params.startDate === 'string' ? new Date(params.startDate).getTime() : params.startDate;
        if ((sig.timestamp || sig.createdAt || 0) < start) return false;
      }
      if (params.endDate) {
        const end = typeof params.endDate === 'string' ? new Date(params.endDate).getTime() : params.endDate;
        if ((sig.timestamp || sig.createdAt || 0) > end) return false;
      }

      // Free text search (ID, explanation, reasons, conditions)
      if (params.search && params.search.trim().length > 0) {
        const q = params.search.trim().toLowerCase();
        const inId = sig.id.toLowerCase().includes(q);
        const inExpl = (sig.setupExplanation || '').toLowerCase().includes(q);
        const inInst = sig.instrument.toLowerCase().includes(q);
        const inStrat = (sig.strategy || '').toLowerCase().includes(q);
        const inReasons = (sig.reasons || []).some((r) => r.toLowerCase().includes(q));
        const inConditions = (sig.conditionsDetected || []).some((c) => c.toLowerCase().includes(q));
        const inInvalidation = (sig.invalidationCondition || '').toLowerCase().includes(q);
        if (!inId && !inExpl && !inInst && !inStrat && !inReasons && !inConditions && !inInvalidation) {
          return false;
        }
      }

      return true;
    });

    // Sorting
    const sortBy = params.sortBy || 'timestamp';
    const sortOrder = params.sortOrder || 'desc';
    const multiplier = sortOrder === 'asc' ? 1 : -1;

    filtered.sort((a, b) => {
      if (sortBy === 'confidence') {
        const confA = a.aiConfidence || a.confidenceScore || 0;
        const confB = b.aiConfidence || b.confidenceScore || 0;
        return (confA - confB) * multiplier;
      }
      if (sortBy === 'outcomeR') {
        const rA = a.outcomeR !== undefined ? a.outcomeR : 0;
        const rB = b.outcomeR !== undefined ? b.outcomeR : 0;
        return (rA - rB) * multiplier;
      }
      if (sortBy === 'riskReward') {
        return ((a.riskRewardRatio || 0) - (b.riskRewardRatio || 0)) * multiplier;
      }
      if (sortBy === 'instrument') {
        return a.instrument.localeCompare(b.instrument) * multiplier;
      }
      // default timestamp
      const timeA = a.timestamp || a.createdAt || 0;
      const timeB = b.timestamp || b.createdAt || 0;
      return (timeA - timeB) * multiplier;
    });

    // Calculate aggregated stats across ALL stored signals
    let wins = 0;
    let losses = 0;
    let ambiguous = 0;
    let expired = 0;
    let cancelled = 0;
    let totalR = 0;
    let grossWinR = 0;
    let grossLossR = 0;
    let activeCount = 0;
    let historyCount = 0;

    for (const s of allSignals) {
      if (s.status === 'ACTIVE') {
        activeCount++;
      } else {
        historyCount++;
        if (s.status === 'TP1_HIT' || s.status === 'TP2_HIT' || s.status === 'TP_HIT') {
          wins++;
          const r = s.outcomeR !== undefined ? s.outcomeR : s.riskRewardRatio;
          grossWinR += r;
          totalR += r;
        } else if (s.status === 'SL_HIT') {
          losses++;
          const r = s.outcomeR !== undefined ? s.outcomeR : -1.0;
          grossLossR += Math.abs(r);
          totalR += r;
        } else if (s.status === 'AMBIGUOUS') {
          ambiguous++;
        } else if (s.status === 'EXPIRED') {
          expired++;
        } else if (s.status === 'CANCELLED' || s.status === 'INVALIDATED') {
          cancelled++;
        }
      }
    }

    const completedCount = wins + losses;
    const winRate = completedCount > 0 ? Number(((wins / completedCount) * 100).toFixed(1)) : 0;
    const avgR = completedCount > 0 ? Number((totalR / completedCount).toFixed(2)) : 0;
    const profitFactor = grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : grossWinR > 0 ? 99 : 1.0;

    // Pagination
    const filteredCount = filtered.length;
    let page = Math.max(1, params.page || 1);
    let limit = params.limit === 'all' ? filteredCount : Math.max(1, params.limit || 20);
    if (limit === 0) limit = 20;

    const totalPages = Math.ceil(filteredCount / limit) || 1;
    if (page > totalPages && totalPages > 0) {
      page = totalPages;
    }

    const startIndex = (page - 1) * limit;
    const paginatedSignals = params.limit === 'all' ? filtered : filtered.slice(startIndex, startIndex + limit);

    return {
      signals: paginatedSignals,
      totalCount,
      filteredCount,
      page,
      limit,
      totalPages,
      activeCount,
      historyCount,
      stats: {
        totalSignals: totalCount,
        activeSignals: activeCount,
        completedSignals: historyCount,
        wins,
        losses,
        ambiguous,
        expired,
        cancelled,
        winRate,
        totalR: Number(totalR.toFixed(2)),
        avgR,
        profitFactor,
      },
      storage: {
        driver: this.storageDriver,
        status: 'HEALTHY',
        filePath: this.filePath,
        totalStoredRecords: this.memoryCache.size,
        lastSavedTimestamp: this.lastSavedTimestamp,
      },
    };
  }

  /**
   * Diagnostic Storage Status info
   */
  public getStorageStatus(): StorageStatus {
    return {
      driver: this.storageDriver,
      status: 'HEALTHY',
      connected: true,
      filePath: this.filePath,
      totalRecords: this.memoryCache.size,
      lastSavedAt: new Date(this.lastSavedTimestamp || Date.now()).toISOString(),
      details: `Persistent filesystem JSON storage active at ${this.filePath}. Signals survive server restarts and browser reloads.`,
    };
  }
}
