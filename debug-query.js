// Debug script to understand 2026 budget data doubling issue
// Run with: node debug-query.js

require('dotenv').config();
const sheetsClient = require('./financial-analyst/tools/google-sheets-consolidated');

async function debug() {
  console.log('=== DEBUGGING 2026 BUDGET QUERY ===\n');

  // First, list all tabs
  console.log('1. Getting tab list...');
  const tabs = await sheetsClient.getTabList();
  console.log('Available tabs:');
  tabs.forEach(t => console.log('   -', t));
  console.log('');

  // Check which tabs match our configs
  console.log('2. Tabs that match configs:');
  for (const tabName of tabs) {
    const config = sheetsClient.getTabConfig(tabName);
    if (config) {
      console.log(`   - "${tabName}" -> type: ${config.type}, statement: ${config.statement}`);
    }
  }
  console.log('');

  // Load data from each income statement tab separately
  console.log('3. Loading income statement tabs individually...\n');

  const incomeStatementTabs = tabs.filter(t => t.includes('Income Statement'));

  for (const tabName of incomeStatementTabs) {
    console.log(`--- ${tabName} ---`);
    try {
      const data = await sheetsClient.loadTab(tabName);

      // Count records by year
      const yearCounts = {};
      const yearTotals = {};

      for (const row of data) {
        const year = row.year || 'null';
        yearCounts[year] = (yearCounts[year] || 0) + 1;
        yearTotals[year] = (yearTotals[year] || 0) + row.value;
      }

      console.log('Records by year:', yearCounts);
      console.log('Value totals by year:', yearTotals);

      // Check for 2026 data
      const data2026 = data.filter(r => r.year === '2026');

      // Get gross revenue rollups (8 buckets)
      const grossRevenueRollups = [
        'Fondue Revenue',
        'Marketing AI Revenue',
        'Messaging Revenue',
        'Platform Revenue',
        'PS Plus Revenue',
        'Shopper Revenue',
        'Short Code Revenue',
        'SMS Sales Revenue'
      ];

      let grossRevenue = 0;
      for (const row of data2026) {
        if (grossRevenueRollups.includes(row.rollup)) {
          grossRevenue += row.value || 0;
        }
      }

      console.log(`2026 Gross Revenue from this tab: $${(grossRevenue / 1000000).toFixed(2)}M`);
      console.log('');
    } catch (err) {
      console.log('Error:', err.message);
      console.log('');
    }
  }

  // Now do a consolidated query
  console.log('4. Running consolidated query for 2026 Budget...\n');

  const result = await sheetsClient.query({ Type: 'budget', Year: '2026' });

  console.log('Total rows:', result.row_count);
  console.log('Total amount:', result.total_amount);

  // Get rollup totals for revenue items (8 buckets)
  const grossRevenueRollups = [
    'Fondue Revenue',
    'Marketing AI Revenue',
    'Messaging Revenue',
    'Platform Revenue',
    'PS Plus Revenue',
    'Shopper Revenue',
    'Short Code Revenue',
    'SMS Sales Revenue'
  ];

  let calculatedGrossRevenue = 0;
  console.log('\nRevenue rollups:');
  for (const rollup of grossRevenueRollups) {
    const value = result.rollup_totals[rollup] || 0;
    console.log(`  ${rollup}: $${(value / 1000000).toFixed(2)}M`);
    calculatedGrossRevenue += value;
  }

  console.log(`\nCalculated Gross Revenue: $${(calculatedGrossRevenue / 1000000).toFixed(2)}M`);
  console.log('Expected Gross Revenue: $145.52M');
  console.log(`Ratio: ${(calculatedGrossRevenue / 145519885).toFixed(2)}x`);

  // Check sample rows to see which tabs they came from
  console.log('\nSample rows (showing _tab):');
  result.sample_rows.forEach(r => {
    console.log(`  Tab: ${r._tab || 'N/A'}, Rollup: ${r.rollup}, Value: ${r.value}`);
  });

  // Let's also check if there are duplicate entries
  console.log('\n5. Checking for potential duplicates...');

  const allData = await sheetsClient.loadAllData();
  const budget2026 = allData.filter(r => r._type === 'budget' && r.year === '2026');

  // Group by tab
  const byTab = {};
  for (const row of budget2026) {
    const tab = row._tab;
    byTab[tab] = (byTab[tab] || 0) + 1;
  }

  console.log('2026 Budget records by tab:');
  for (const [tab, count] of Object.entries(byTab)) {
    console.log(`  ${tab}: ${count} records`);
  }
}

debug().catch(console.error);
