import { MarketDataManager } from '../server/providers/MarketDataManager';
import { getCandleState, REFRESH_INTERVALS } from '../server/config/intervals';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('======================================================');
  console.log('RUNNING CONTINUOUS LIVE MARKET REFRESH TEST SUITE');
  console.log('======================================================');

  const manager = new MarketDataManager();
  manager.resetState();

  // Test 1: Intervals
  assert(REFRESH_INTERVALS.QUOTE_REFRESH_INTERVAL_MS === 5000, 'Quote refresh interval must default to 5000ms');
  assert(REFRESH_INTERVALS.CANDLE_REFRESH_INTERVAL_MS === 15000, 'Candle refresh interval must default to 15000ms');
  assert(REFRESH_INTERVALS.SCAN_INTERVAL_MS === 30000, 'Scan interval must default to 30000ms');
  assert(REFRESH_INTERVALS.STALE_THRESHOLD_MS === 60000, 'Stale threshold must default to 60000ms');
  console.log('✅ [PASS] Test 1: Configurable intervals defaults are respected');

  // Test 2: Candle state calculation
  const now = 1700000000000;
  const formingCandleTime = now - (5 * 60 * 1000); // 5 min into M15 candle
  assert(getCandleState(formingCandleTime, 'M15', now) === 'FORMING', 'Active unfinished candle must be marked FORMING');

  const closedCandleTime = now - (20 * 60 * 1000); // 20 min ago
  assert(getCandleState(closedCandleTime, 'M15', now) === 'CLOSED', 'Recent past candle must be marked CLOSED');

  const oldCandleTime = now - (120 * 60 * 1000); // 2 hours ago
  assert(getCandleState(oldCandleTime, 'M15', now) === 'STALE', 'Old candle must be marked STALE');
  console.log('✅ [PASS] Test 2: Candle state calculation (FORMING vs CLOSED vs STALE)');

  // Test 3: Engine status reporting
  const symbol = 'EURUSD';
  let status = await manager.getEngineStatus(symbol, 0);
  assert(['RECONNECTING', 'OFFLINE'].includes(status.marketFeed), 'Initial state without ticks must be RECONNECTING/OFFLINE');

  manager.recordQuoteTimestamp(symbol, Date.now());
  assert(!manager.isDataStale(symbol), 'Fresh tick must not be stale');
  assert(manager.getDataAgeSeconds(symbol) <= 1, 'Data age should be <= 1s');

  status = await manager.getEngineStatus(symbol, 4);
  assert(status.marketFeed === 'LIVE', 'Fresh quotes should report LIVE');
  assert(status.scannerStatus === 'ACTIVE', 'Scanner must be ACTIVE when feed is LIVE');
  assert(status.signalsMonitoredCount === 4, 'Signal count must match active signals');
  console.log('✅ [PASS] Test 3: Engine status reports LIVE and monitors signals');

  // Test 4: Stale data pause behavior
  manager.recordQuoteTimestamp(symbol, Date.now() - 75000);
  assert(manager.isDataStale(symbol), 'Quotes older than 60s must be marked STALE');
  assert(manager.getDataAgeSeconds(symbol) >= 75, 'Data age calculation correct');

  status = await manager.getEngineStatus(symbol, 4);
  assert(status.marketFeed === 'STALE', 'Feed status must transition to STALE');
  assert(status.scannerStatus === 'PAUSED', 'Scanner must pause on stale data');
  assert(status.pauseReason !== undefined && status.pauseReason.includes('STALE DATA'), 'Clear pause reason reported');
  console.log('✅ [PASS] Test 4: Stale data triggers PAUSED scanner state and capital protection');

  // Test 5: Exponential backoff calculation
  manager.handlePrimaryFailure('EURUSD', 'Rate limit');
  assert(manager.getPrimaryCooldownDuration() === 30000, 'First cooldown must be 30s');

  manager.handlePrimaryFailure('EURUSD', 'Gateway error 2');
  assert(manager.getPrimaryCooldownDuration() === 60000, 'Second cooldown must be 60s');

  manager.handlePrimaryFailure('EURUSD', 'Gateway error 3');
  assert(manager.getPrimaryCooldownDuration() === 120000, 'Third cooldown must be 120s');

  manager.handlePrimaryFailure('EURUSD', 'Gateway error 4');
  assert(manager.getPrimaryCooldownDuration() === 240000, 'Fourth cooldown must cap at 240s');

  manager.handlePrimaryFailure('EURUSD', 'Gateway error 5');
  assert(manager.getPrimaryCooldownDuration() === 240000, 'Fifth cooldown must stay capped at 240s');

  manager.handlePrimarySuccess('EURUSD');
  assert(manager.getPrimaryCooldownDuration() === 30000, 'Successful primary recovery resets backoff to base');
  console.log('✅ [PASS] Test 5: Exponential backoff cooldown increments and resets cleanly');

  console.log('======================================================');
  console.log('TEST SUITE COMPLETE: ALL 5 TESTS PASSED');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
