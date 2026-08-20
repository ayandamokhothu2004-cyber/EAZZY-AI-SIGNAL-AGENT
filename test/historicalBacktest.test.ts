import { runAutomatedBacktestSuite } from '../src/backtest/testSuite';

console.log('====================================================');
console.log('RUNNING STEP 5 HISTORICAL BACKTESTING ENGINE TESTS (18 TEST POINTS)');
console.log('====================================================');

const suite = runAutomatedBacktestSuite();

console.log(`Executed ${suite.totalTests} tests in ${suite.executionDurationMs}ms.`);
console.log(`Passed: ${suite.passedCount} / ${suite.totalTests}`);
console.log(`Failed: ${suite.failedCount}`);

for (const test of suite.results) {
  const status = test.passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${status}] ${test.id} - ${test.name} [${test.category}]`);
  if (!test.passed) {
    console.error(`   Expected: ${test.expected}`);
    console.error(`   Actual:   ${test.actual}`);
    if (test.details) console.error(`   Details:  ${test.details}`);
  }
}

if (!suite.allPassed) {
  console.error('\n❌ Backtesting Test Suite FAILED!');
  process.exit(1);
} else {
  console.log('\n✅ All 18 Backtesting Test Suite Verification Points PASSED Successfully!');
  process.exit(0);
}
