import { NewsRiskProvider, NewsRiskInfo } from '../types';

/**
 * Default News Risk Provider placeholder
 * Returns deterministic news risk state (defaults to UNKNOWN / LOW unless scheduled high-impact events exist).
 */
export class DefaultNewsRiskProvider implements NewsRiskProvider {
  getNewsRisk(symbol: string): NewsRiskInfo {
    return {
      symbol,
      riskLevel: 'UNKNOWN',
      notes: 'No high-impact economic news embargo active for this instrument.',
      timestamp: Date.now(),
    };
  }
}

export const defaultNewsRiskProvider = new DefaultNewsRiskProvider();
