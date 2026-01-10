// Pre-computed Financial Metrics Store
// Calculates and stores key metrics in Postgres, refreshed daily

const { Pool } = require('pg');
const sheetsClient = require('./tools/google-sheets-consolidated');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize the metrics table
async function initializeTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fpa_metrics (
      id SERIAL PRIMARY KEY,
      scenario TEXT NOT NULL,
      year TEXT NOT NULL,
      period_type TEXT NOT NULL,
      period TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      value NUMERIC,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(scenario, year, period_type, period, metric_name)
    )
  `);

  // Create index for fast lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fpa_metrics_lookup
    ON fpa_metrics(scenario, year, period_type)
  `);

  console.log('[Metrics Store] Table initialized');
}

// Revenue and cost rollup definitions
const REVENUE_ROLLUPS = [
  'Messaging Revenue', 'Platform Revenue', 'Short Code Revenue',
  'Postscript AI Revenue', 'PS Plus Revenue', 'SMS Sales Revenue',
  'Fondue Revenue', 'Advertising Revenue'
];

const COGS_ROLLUPS = [
  'Hosting', 'Twilio Messaging', 'Twilio Short Codes', 'SMS Sales COGS',
  'Prepaid Cards', 'Postscript Plus Servicing Costs', 'CXAs Servicing Costs', 'MAI OpenAI Costs'
];

const OPEX_ROLLUPS = [
  'Indirect Labor', 'T&E', 'Tech & IT', 'Professional Fees', 'Marketing Expense',
  'Payment Processing', 'Other OpEx', 'Recruiting Expense', 'Bad Debt', 'Severance',
  'Bank Fees', 'Twilio OPEX', 'Contra Payroll'
];

// Calculate metrics for a specific scenario and year
async function calculateMetricsForScenario(scenario, year) {
  const type = scenario === 'Actuals' ? 'actuals' : 'budget';

  console.log(`[Metrics Store] Calculating metrics for ${scenario} ${year}...`);

  // Query the raw data
  const result = await sheetsClient.query({ Type: type, Year: year });
  const rollupTotals = result.rollup_totals || {};

  // Get all rows for monthly/quarterly breakdown
  const allData = await sheetsClient.loadAllData();
  const filtered = allData.filter(row => {
    if (row._type !== type) return false;
    if (row.year !== year) return false;
    return true;
  });

  const metrics = [];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

  // Calculate annual totals
  const grossRevenue = REVENUE_ROLLUPS.reduce((sum, r) => sum + (rollupTotals[r] || 0), 0);
  const carrierFees = rollupTotals['Twilio Carrier Fees'] || 0;
  const netRevenue = grossRevenue - carrierFees;
  const totalCOGS = COGS_ROLLUPS.reduce((sum, r) => sum + (rollupTotals[r] || 0), 0);
  const grossProfit = netRevenue - totalCOGS;
  const totalOpEx = OPEX_ROLLUPS.reduce((sum, r) => sum + (rollupTotals[r] || 0), 0);
  const ebitda = grossProfit - totalOpEx;

  // Store annual metrics
  metrics.push({ period_type: 'annual', period: 'FY', metric_name: 'gross_revenue', value: grossRevenue });
  metrics.push({ period_type: 'annual', period: 'FY', metric_name: 'carrier_fees', value: carrierFees });
  metrics.push({ period_type: 'annual', period: 'FY', metric_name: 'net_revenue', value: netRevenue });
  metrics.push({ period_type: 'annual', period: 'FY', metric_name: 'total_cogs', value: totalCOGS });
  metrics.push({ period_type: 'annual', period: 'FY', metric_name: 'gross_profit', value: grossProfit });
  metrics.push({ period_type: 'annual', period: 'FY', metric_name: 'gross_margin_pct', value: netRevenue > 0 ? (grossProfit / netRevenue * 100) : 0 });
  metrics.push({ period_type: 'annual', period: 'FY', metric_name: 'total_opex', value: totalOpEx });
  metrics.push({ period_type: 'annual', period: 'FY', metric_name: 'ebitda', value: ebitda });
  metrics.push({ period_type: 'annual', period: 'FY', metric_name: 'ebitda_margin_pct', value: netRevenue > 0 ? (ebitda / netRevenue * 100) : 0 });

  // Calculate monthly metrics
  for (const month of months) {
    const monthRows = filtered.filter(r => r.month === month);
    if (monthRows.length === 0) continue;

    let mGrossRev = 0, mCarrierFees = 0, mCOGS = 0, mOpEx = 0;
    for (const row of monthRows) {
      if (REVENUE_ROLLUPS.includes(row.rollup)) mGrossRev += row.value || 0;
      if (row.rollup === 'Twilio Carrier Fees') mCarrierFees += row.value || 0;
      if (COGS_ROLLUPS.includes(row.rollup)) mCOGS += row.value || 0;
      if (OPEX_ROLLUPS.includes(row.rollup)) mOpEx += row.value || 0;
    }

    const mNetRev = mGrossRev - mCarrierFees;
    const mGrossProfit = mNetRev - mCOGS;
    const mEbitda = mGrossProfit - mOpEx;

    metrics.push({ period_type: 'monthly', period: month, metric_name: 'gross_revenue', value: mGrossRev });
    metrics.push({ period_type: 'monthly', period: month, metric_name: 'carrier_fees', value: mCarrierFees });
    metrics.push({ period_type: 'monthly', period: month, metric_name: 'net_revenue', value: mNetRev });
    metrics.push({ period_type: 'monthly', period: month, metric_name: 'total_cogs', value: mCOGS });
    metrics.push({ period_type: 'monthly', period: month, metric_name: 'gross_profit', value: mGrossProfit });
    metrics.push({ period_type: 'monthly', period: month, metric_name: 'gross_margin_pct', value: mNetRev > 0 ? (mGrossProfit / mNetRev * 100) : 0 });
    metrics.push({ period_type: 'monthly', period: month, metric_name: 'total_opex', value: mOpEx });
    metrics.push({ period_type: 'monthly', period: month, metric_name: 'ebitda', value: mEbitda });
    metrics.push({ period_type: 'monthly', period: month, metric_name: 'ebitda_margin_pct', value: mNetRev > 0 ? (mEbitda / mNetRev * 100) : 0 });
  }

  // Calculate quarterly metrics
  for (const quarter of quarters) {
    const quarterRows = filtered.filter(r => r.quarter === quarter);
    if (quarterRows.length === 0) continue;

    let qGrossRev = 0, qCarrierFees = 0, qCOGS = 0, qOpEx = 0;
    for (const row of quarterRows) {
      if (REVENUE_ROLLUPS.includes(row.rollup)) qGrossRev += row.value || 0;
      if (row.rollup === 'Twilio Carrier Fees') qCarrierFees += row.value || 0;
      if (COGS_ROLLUPS.includes(row.rollup)) qCOGS += row.value || 0;
      if (OPEX_ROLLUPS.includes(row.rollup)) qOpEx += row.value || 0;
    }

    const qNetRev = qGrossRev - qCarrierFees;
    const qGrossProfit = qNetRev - qCOGS;
    const qEbitda = qGrossProfit - qOpEx;

    metrics.push({ period_type: 'quarterly', period: quarter, metric_name: 'gross_revenue', value: qGrossRev });
    metrics.push({ period_type: 'quarterly', period: quarter, metric_name: 'carrier_fees', value: qCarrierFees });
    metrics.push({ period_type: 'quarterly', period: quarter, metric_name: 'net_revenue', value: qNetRev });
    metrics.push({ period_type: 'quarterly', period: quarter, metric_name: 'total_cogs', value: qCOGS });
    metrics.push({ period_type: 'quarterly', period: quarter, metric_name: 'gross_profit', value: qGrossProfit });
    metrics.push({ period_type: 'quarterly', period: quarter, metric_name: 'gross_margin_pct', value: qNetRev > 0 ? (qGrossProfit / qNetRev * 100) : 0 });
    metrics.push({ period_type: 'quarterly', period: quarter, metric_name: 'total_opex', value: qOpEx });
    metrics.push({ period_type: 'quarterly', period: quarter, metric_name: 'ebitda', value: qEbitda });
    metrics.push({ period_type: 'quarterly', period: quarter, metric_name: 'ebitda_margin_pct', value: qNetRev > 0 ? (qEbitda / qNetRev * 100) : 0 });
  }

  return metrics;
}

// Store metrics in database
async function storeMetrics(scenario, year, metrics) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete existing metrics for this scenario/year
    await client.query(
      'DELETE FROM fpa_metrics WHERE scenario = $1 AND year = $2',
      [scenario, year]
    );

    // Insert new metrics
    for (const m of metrics) {
      await client.query(
        `INSERT INTO fpa_metrics (scenario, year, period_type, period, metric_name, value, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [scenario, year, m.period_type, m.period, m.metric_name, m.value]
      );
    }

    await client.query('COMMIT');
    console.log(`[Metrics Store] Stored ${metrics.length} metrics for ${scenario} ${year}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Refresh all metrics for all scenarios
async function refreshAllMetrics() {
  console.log('[Metrics Store] Starting daily metrics refresh...');

  await initializeTable();

  // Clear the sheets cache to get fresh data
  sheetsClient.clearCache();

  const scenarios = [
    { scenario: '2025 Budget', year: '2025' },
    { scenario: '2026 Budget', year: '2026' },
    { scenario: 'Actuals', year: '2025' },
    // Add 2026 actuals when available
  ];

  for (const { scenario, year } of scenarios) {
    try {
      const metrics = await calculateMetricsForScenario(scenario, year);
      await storeMetrics(scenario, year, metrics);
    } catch (err) {
      console.error(`[Metrics Store] Error processing ${scenario} ${year}:`, err.message);
    }
  }

  console.log('[Metrics Store] Daily refresh complete');
}

// Get metrics from database
async function getMetrics(scenario, year, periodType = null) {
  let query = 'SELECT * FROM fpa_metrics WHERE scenario = $1 AND year = $2';
  const params = [scenario, year];

  if (periodType) {
    query += ' AND period_type = $3';
    params.push(periodType);
  }

  query += ' ORDER BY period_type, period, metric_name';

  const result = await pool.query(query, params);

  // Transform to structured format
  const metrics = {
    scenario,
    year,
    annual: {},
    quarterly: {},
    monthly: {}
  };

  for (const row of result.rows) {
    const target = metrics[row.period_type] || {};
    if (!target[row.period]) target[row.period] = {};
    target[row.period][row.metric_name] = parseFloat(row.value);
    metrics[row.period_type] = target;
  }

  // Flatten annual (only one period: FY)
  if (metrics.annual.FY) {
    metrics.annual = metrics.annual.FY;
  }

  return metrics;
}

// Get last refresh time
async function getLastRefreshTime() {
  const result = await pool.query(
    'SELECT MAX(updated_at) as last_refresh FROM fpa_metrics'
  );
  return result.rows[0]?.last_refresh;
}

module.exports = {
  initializeTable,
  refreshAllMetrics,
  calculateMetricsForScenario,
  storeMetrics,
  getMetrics,
  getLastRefreshTime
};
