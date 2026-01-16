// Test Scenarios for FPA Bot
// Run with: node test-scenarios.js

require('dotenv').config();

const financialAnalyst = require('./financial-analyst');

const TEST_SCENARIOS = [
  {
    name: 'Year interpretation: 2025 should be actuals',
    question: 'What was our net revenue in 2025?',
    checks: [
      { type: 'contains', value: 'actual', caseSensitive: false, description: 'Should mention actuals' },
      { type: 'notContains', value: '2025 budget', caseSensitive: false, description: 'Should NOT use 2025 budget' },
      { type: 'containsNumber', description: 'Should include a dollar amount' }
    ]
  },
  {
    name: 'Year interpretation: 2026 should be budget',
    question: 'What is our net revenue budget for 2026?',
    checks: [
      { type: 'contains', value: 'budget', caseSensitive: false, description: 'Should mention budget' },
      { type: 'containsNumber', description: 'Should include a dollar amount' }
    ]
  },
  {
    name: 'Comparison: 2026 vs 2025 should be budget vs actuals',
    question: 'How does 2026 EBITDA compare to 2025?',
    checks: [
      { type: 'contains', value: '2026', caseSensitive: false, description: 'Should mention 2026' },
      { type: 'contains', value: '2025', caseSensitive: false, description: 'Should mention 2025' },
      { type: 'containsNumber', description: 'Should include numbers' }
    ]
  },
  {
    name: 'Data lookup hierarchy: Should use Metrics tab for EBITDA',
    question: 'What was EBITDA in Q4 2025?',
    checks: [
      { type: 'containsNumber', description: 'Should include a dollar amount' },
      { type: 'contains', value: 'Q4', caseSensitive: false, description: 'Should specify Q4' }
    ]
  },
  {
    name: 'Scenario clarity: Should state scenario and period',
    question: 'What is our gross margin?',
    checks: [
      { type: 'containsAny', values: ['actual', 'budget', '2025', '2026'], caseSensitive: false, description: 'Should specify scenario or year' },
      { type: 'containsNumber', description: 'Should include a percentage' }
    ]
  }
];

async function runCheck(response, check) {
  const text = response.text || '';

  switch (check.type) {
    case 'contains':
      const searchTerm = check.caseSensitive ? check.value : check.value.toLowerCase();
      const searchText = check.caseSensitive ? text : text.toLowerCase();
      return searchText.includes(searchTerm);

    case 'notContains':
      const notSearchTerm = check.caseSensitive ? check.value : check.value.toLowerCase();
      const notSearchText = check.caseSensitive ? text : text.toLowerCase();
      return !notSearchText.includes(notSearchTerm);

    case 'containsNumber':
      return /\$[\d,.]+[KMB]?|\d+%|\d{1,3}(,\d{3})+/.test(text);

    case 'containsAny':
      const lowerText = text.toLowerCase();
      return check.values.some(v => lowerText.includes(v.toLowerCase()));

    default:
      return false;
  }
}

async function runScenario(scenario) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${scenario.name}`);
  console.log(`Question: "${scenario.question}"`);
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    const response = await financialAnalyst.analyze(scenario.question, {
      userId: 'test-user',
      channelId: 'test-channel',
      threadTs: `test-${Date.now()}`
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\nResponse (${duration}s):`);
    console.log('-'.repeat(40));
    // Truncate long responses
    const displayText = response.text?.length > 500
      ? response.text.substring(0, 500) + '...[truncated]'
      : response.text;
    console.log(displayText || '[No text response]');
    console.log('-'.repeat(40));

    // Run checks
    console.log('\nChecks:');
    let allPassed = true;
    for (const check of scenario.checks) {
      const passed = await runCheck(response, check);
      const status = passed ? '✓' : '✗';
      console.log(`  ${status} ${check.description}`);
      if (!passed) allPassed = false;
    }

    return {
      name: scenario.name,
      passed: allPassed,
      response: response.text,
      duration
    };

  } catch (error) {
    console.log(`\nERROR: ${error.message}`);
    return {
      name: scenario.name,
      passed: false,
      error: error.message
    };
  }
}

async function main() {
  console.log('FPA Bot Test Scenarios');
  console.log('='.repeat(60));

  // Check configuration
  const config = financialAnalyst.checkConfiguration();
  console.log('\nConfiguration:');
  Object.entries(config).forEach(([key, value]) => {
    console.log(`  ${value ? '✓' : '✗'} ${key}`);
  });

  if (!config.anthropic || !config.google_sheets) {
    console.log('\nMissing required configuration. Set environment variables and retry.');
    process.exit(1);
  }

  const results = [];

  for (const scenario of TEST_SCENARIOS) {
    const result = await runScenario(scenario);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(r => {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}: ${r.name}`);
  });

  console.log(`\nTotal: ${passed}/${results.length} passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
