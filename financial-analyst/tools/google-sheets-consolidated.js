// Google Sheets Client for Budget & Actuals
// Works with Aleph export format: headers in row 14, multiple tabs for Budget/Actuals

const { google } = require('googleapis');

// Tab configurations - maps tab patterns to their structure
// Tab names updated 2026-01 to match current sheet structure
const TAB_CONFIGS = {
  // Combined BvA table - preferred source for income statement (has consistent rollup names)
  'BvA Income Statement': {
    statement: 'income_statement',
    headerRow: 14,
    // Type comes from Scenario column, not hardcoded
    typeFromColumn: 'Scenario',
    typeMapping: {
      '2026 Budget': 'budget',
      '2025 Budget': 'budget',
      'Actuals': 'actuals'
    },
    columns: {
      account: 'Account',
      vendor: 'Vendor Name',
      department: 'Department Aleph',
      rollup: 'Consolidated Rollup Aleph',
      month: 'Month',
      value: 'Value',
      year: 'Year',
      quarter: 'Quarter',
      scenario: 'Scenario'
    }
  },
  // Legacy separate tabs - kept as fallback
  '2026 Budget - Income Statement': {
    type: 'budget',
    statement: 'income_statement',
    headerRow: 14,
    columns: {
      account: 'Account',
      vendor: 'Vendor',
      department: 'Department Aleph',
      rollup: 'Consolidated Rollup Aleph',
      month: 'Month',
      value: 'value',
      quarter: 'Quarter',
      year: 'Year'
    }
  },
  '2025 Budget - Income Statement': {
    type: 'budget',
    statement: 'income_statement',
    headerRow: 14,
    columns: {
      account: 'Account',
      vendor: 'Vendor',
      department: 'Department Aleph',
      rollup: 'Consolidated Rollup Aleph',
      month: 'Month',
      value: 'value',
      quarter: 'Quarter',
      year: 'Year'
    }
  },
  'Actuals - Income Statement': {
    type: 'actuals',
    statement: 'income_statement',
    headerRow: 14,
    columns: {
      month: 'Month',
      account: 'Account',
      vendor: 'Vendor Name',
      rollup: 'Consolidated Rollup Aleph',
      department: 'Department Aleph',
      value: 'Value'
      // Quarter and Year derived from Month
    }
  },
  // Combined BvA table for balance sheet
  'BvA Balance Sheet': {
    statement: 'balance_sheet',
    headerRow: 14,
    typeFromColumn: 'Scenario',
    typeMapping: {
      '2026 Budget': 'budget',
      '2025 Budget': 'budget',
      'Actuals': 'actuals'
    },
    columns: {
      account: 'Account',
      rollup: 'Consolidated Rollup Aleph',
      month: 'Month',
      value: 'Value',
      year: 'Year',
      quarter: 'Quarter',
      scenario: 'Scenario'
    }
  },
  // Legacy separate tabs - kept as fallback
  '2026 Budget - Balance Sheet': {
    type: 'budget',
    statement: 'balance_sheet',
    headerRow: 14,
    columns: {
      account: 'Account',
      rollup: 'Consolidated Rollup Aleph',
      month: 'Month',
      value: 'value',
      quarter: 'Quarter',
      year: 'Year'
    }
  },
  '2025 Budget - Balance Sheet': {
    type: 'budget',
    statement: 'balance_sheet',
    headerRow: 14,
    columns: {
      account: 'Account',
      rollup: 'Consolidated Rollup Aleph',
      month: 'Month',
      value: 'value',
      quarter: 'Quarter',
      year: 'Year'
    }
  },
  'Actuals - Balance Sheet': {
    type: 'actuals',
    statement: 'balance_sheet',
    headerRow: 14,
    columns: {
      month: 'Month',
      account: 'Account',
      rollup: 'Consolidated Rollup Aleph',
      value: 'Value'
      // Quarter and Year derived from Month
    }
  },
  // Combined Metrics table (type derived from date: past = actuals, future = budget)
  'Metrics': {
    type: 'metrics',
    statement: 'metrics',
    headerRow: 14,
    columns: {
      department: 'Department',
      product: 'Product',
      metricName: 'Metric Name',
      metricType: 'Metric Type',
      month: 'Month',
      value: 'value',
      quarter: 'Quarter',
      year: 'Year'
    }
  },
  // Legacy metrics tab
  '2026 Budget and pre-2026 Actuals - Metrics': {
    type: 'metrics', // Special handling - past periods are actuals, future are budget
    statement: 'metrics',
    headerRow: 14,
    columns: {
      department: 'Department',
      product: 'Product',
      metricName: 'Metric Name',
      metricType: 'Metric Type',
      month: 'Month',
      value: 'value',
      quarter: 'Quarter',
      year: 'Year'
    }
  }
};

// Rollup name normalization - maps variant names to canonical names
// This handles differences between 2025 Budget, 2026 Budget, and Actuals
const ROLLUP_NORMALIZATION = {
  // Revenue: 2025 Budget uses "Marketing AI Revenue", 2026 Budget/Actuals use "Postscript AI Revenue"
  'Marketing AI Revenue': 'Postscript AI Revenue',

  // COGS: 2026 Budget uses "Hosting Costs", others use "Hosting"
  'Hosting Costs': 'Hosting',

  // COGS: 2026 Budget uses "PS Plus Servicing Costs", others use "Postscript Plus Servicing Costs"
  'PS Plus Servicing Costs': 'Postscript Plus Servicing Costs',
};

/**
 * Normalize a rollup name to its canonical form
 */
function normalizeRollup(rollup) {
  if (!rollup) return rollup;
  return ROLLUP_NORMALIZATION[rollup] || rollup;
}

class GoogleSheetsClient {
  constructor() {
    this.sheetId = process.env.GOOGLE_BUDGET_SHEET_ID; // Same env var as before
    this.sheets = null;
    this.cachedTabs = {}; // Cache per tab
    this.cacheTime = null;
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute cache
  }

  async initialize() {
    if (this.sheets) return;

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error('Google Sheets credentials not configured');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  /**
   * Get list of all tabs in the spreadsheet
   */
  async getTabList() {
    await this.initialize();

    const response = await this.sheets.spreadsheets.get({
      spreadsheetId: this.sheetId
    });

    return response.data.sheets.map(s => s.properties.title);
  }

  /**
   * Find config for a tab name
   */
  getTabConfig(tabName) {
    for (const [pattern, config] of Object.entries(TAB_CONFIGS)) {
      if (tabName.includes(pattern)) {
        return { ...config, tabName };
      }
    }
    return null;
  }

  /**
   * Parse a date value from the sheet (handles Excel serial dates and ISO strings)
   */
  parseDate(value) {
    if (!value) return null;

    // If it's already a Date object or ISO string
    if (value instanceof Date) return value;
    if (typeof value === 'string' && value.includes('-')) {
      return new Date(value);
    }

    // Excel serial date (days since 1900-01-01, with Excel's leap year bug)
    if (typeof value === 'number') {
      const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
      return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    }

    return null;
  }

  /**
   * Get quarter from month (1-12 -> Q1-Q4)
   */
  getQuarter(month) {
    return `Q${Math.ceil(month / 3)}`;
  }

  /**
   * Get month name from month number
   */
  getMonthName(monthNum) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthNum - 1] || null;
  }

  /**
   * Load and parse data from a specific tab
   */
  async loadTab(tabName) {
    // Check cache
    const cacheKey = tabName;
    if (this.cachedTabs[cacheKey] && this.cacheTime && (Date.now() - this.cacheTime < this.CACHE_TTL_MS)) {
      return this.cachedTabs[cacheKey];
    }

    await this.initialize();

    const config = this.getTabConfig(tabName);
    if (!config) {
      throw new Error(`Unknown tab format: ${tabName}`);
    }

    console.log(`[Sheets] Loading tab: ${tabName}`);

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: `'${tabName}'!A:Z`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER'
    });

    const rows = response.data.values || [];
    if (rows.length < config.headerRow) {
      return [];
    }

    // Get headers from row 14 (index 13)
    const headers = rows[config.headerRow - 1];
    console.log(`[Sheets] Headers for ${tabName}:`, headers.filter(h => h));

    // Build column index map
    const colIndex = {};
    headers.forEach((h, i) => {
      if (h) colIndex[h.trim()] = i;
    });

    // Parse data rows
    const data = [];
    for (let i = config.headerRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(cell => cell === null || cell === undefined || cell === '')) continue;

      // Get value - find the value column
      const valueColName = config.columns.value;
      const valueIdx = colIndex[valueColName];
      const rawValue = valueIdx !== undefined ? row[valueIdx] : null;

      // Skip rows with no value
      if (rawValue === null || rawValue === undefined || rawValue === '') continue;

      // Parse value (handle currency formatting, parentheses for negatives)
      let value = rawValue;
      if (typeof value === 'string') {
        value = value.replace(/[$,]/g, '');
        if (value.startsWith('(') && value.endsWith(')')) {
          value = '-' + value.slice(1, -1);
        }
        value = parseFloat(value) || 0;
      }

      // Get month and derive quarter/year
      const monthColName = config.columns.month;
      const monthIdx = colIndex[monthColName];
      const monthRaw = monthIdx !== undefined ? row[monthIdx] : null;
      const monthDate = this.parseDate(monthRaw);

      let month = null, quarter = null, year = null;
      if (monthDate) {
        month = this.getMonthName(monthDate.getMonth() + 1);
        quarter = this.getQuarter(monthDate.getMonth() + 1);
        year = monthDate.getFullYear().toString();
      }

      // Determine type - can come from config, column, or be derived
      let recordType = config.type;

      // If type comes from a column (e.g., Scenario column in BvA tables)
      if (config.typeFromColumn && config.typeMapping) {
        const typeColIdx = colIndex[config.typeFromColumn];
        if (typeColIdx !== undefined) {
          const scenarioValue = row[typeColIdx];
          recordType = config.typeMapping[scenarioValue] || null;
          // Skip rows with unknown scenario
          if (!recordType) continue;
        }
      }

      // For metrics, derive from date (past = actuals, future = budget)
      if (config.type === 'metrics' && monthDate) {
        const now = new Date();
        const firstOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        recordType = monthDate < firstOfCurrentMonth ? 'actuals' : 'budget';
      }

      // Build normalized record
      const record = {
        _tab: tabName,
        _type: recordType, // 'budget' or 'actuals'
        _statement: config.statement, // 'income_statement', 'balance_sheet', 'metrics'
        month,
        quarter,
        year,
        value
      };

      // Add optional fields based on what columns exist
      if (config.columns.account && colIndex[config.columns.account] !== undefined) {
        record.account = row[colIndex[config.columns.account]];
      }
      if (config.columns.vendor && colIndex[config.columns.vendor] !== undefined) {
        record.vendor = row[colIndex[config.columns.vendor]];
      }
      if (config.columns.department && colIndex[config.columns.department] !== undefined) {
        record.department = row[colIndex[config.columns.department]];
      }
      if (config.columns.rollup && colIndex[config.columns.rollup] !== undefined) {
        // Normalize rollup names to handle differences between Budget/Actuals
        record.rollup = normalizeRollup(row[colIndex[config.columns.rollup]]);
      }
      if (config.columns.product && colIndex[config.columns.product] !== undefined) {
        record.product = row[colIndex[config.columns.product]];
      }
      if (config.columns.metricName && colIndex[config.columns.metricName] !== undefined) {
        record.metricName = row[colIndex[config.columns.metricName]];
      }
      if (config.columns.metricType && colIndex[config.columns.metricType] !== undefined) {
        record.metricType = row[colIndex[config.columns.metricType]];
      }

      data.push(record);
    }

    // Debug: show year distribution in this tab
    const yearCounts = {};
    for (const row of data) {
      const year = row.year || 'null';
      yearCounts[year] = (yearCounts[year] || 0) + 1;
    }
    console.log(`[Sheets] Loaded ${data.length} rows from ${tabName}, years:`, JSON.stringify(yearCounts));

    this.cachedTabs[cacheKey] = data;
    this.cacheTime = Date.now();

    return data;
  }

  /**
   * Load all data from all tabs
   */
  async loadAllData() {
    const tabs = await this.getTabList();
    const allData = [];

    console.log(`[Sheets] Found ${tabs.length} tabs, checking for configured tabs...`);

    // Check if combined tabs exist - these are preferred over legacy separate tabs
    const hasBvAIncomeStatement = tabs.some(t => t.includes('BvA Income Statement'));
    const hasBvABalanceSheet = tabs.some(t => t.includes('BvA Balance Sheet'));
    // For Metrics, check if a simple "Metrics" tab exists (without the long legacy name)
    const hasSimpleMetrics = tabs.some(t => t === 'Metrics' || t.includes('BvA Metrics'));
    const loadedStatements = new Set(); // Track which statements we've loaded

    for (const tabName of tabs) {
      const config = this.getTabConfig(tabName);
      if (!config) continue;

      // Skip legacy tabs if combined version exists
      if (config.statement === 'income_statement' && hasBvAIncomeStatement && !tabName.includes('BvA')) {
        console.log(`[Sheets] Skipping ${tabName} (using BvA Income Statement instead)`);
        continue;
      }
      if (config.statement === 'balance_sheet' && hasBvABalanceSheet && !tabName.includes('BvA')) {
        console.log(`[Sheets] Skipping ${tabName} (using BvA Balance Sheet instead)`);
        continue;
      }
      if (config.statement === 'metrics' && hasSimpleMetrics && tabName.includes('2026 Budget')) {
        console.log(`[Sheets] Skipping ${tabName} (using Metrics tab instead)`);
        continue;
      }

      // Skip if we've already loaded this statement type from a BvA tab
      const statementKey = config.statement;
      if (loadedStatements.has(statementKey) && !tabName.includes('BvA')) {
        console.log(`[Sheets] Skipping ${tabName} (already loaded from BvA)`);
        continue;
      }

      try {
        const tabData = await this.loadTab(tabName);
        const typeInfo = config.typeFromColumn ? 'dynamic' : config.type;
        console.log(`[Sheets] Loaded ${tabName}: ${tabData.length} rows, type=${typeInfo}`);
        allData.push(...tabData);

        // Mark this statement as loaded if it's from a BvA tab
        if (tabName.includes('BvA')) {
          loadedStatements.add(statementKey);
        }
      } catch (err) {
        console.error(`[Sheets] Error loading ${tabName}:`, err.message);
      }
    }

    console.log(`[Sheets] Total loaded: ${allData.length} rows from all tabs`);
    return allData;
  }

  /**
   * Explore available values for a dimension
   */
  async explore(dimension, filter = {}) {
    const allData = await this.loadAllData();

    // Map friendly dimension names to record fields
    const dimensionMap = {
      'Type': '_type',
      'Statement': '_statement',
      'Rollup': 'rollup',
      'Account': 'account',
      'Department': 'department',
      'Vendor': 'vendor',
      'Month': 'month',
      'Quarter': 'quarter',
      'Year': 'year',
      'Product': 'product',
      'Metric Name': 'metricName',
      'Metric Type': 'metricType'
    };

    const field = dimensionMap[dimension] || dimension.toLowerCase();

    // Apply filters
    let filtered = allData;
    for (const [key, value] of Object.entries(filter)) {
      const filterField = dimensionMap[key] || key.toLowerCase();
      if (value) {
        filtered = filtered.filter(row => {
          const rowVal = row[filterField]?.toString().toLowerCase();
          const filterVal = value.toString().toLowerCase();
          return rowVal === filterVal || rowVal?.includes(filterVal);
        });
      }
    }

    // Get unique values
    const uniqueValues = [...new Set(filtered.map(row => row[field]).filter(Boolean))];

    return {
      dimension,
      filter: Object.keys(filter).length > 0 ? filter : 'none',
      values: uniqueValues.sort(),
      count: uniqueValues.length
    };
  }

  /**
   * Query data with filters
   */
  async query(filters = {}) {
    const allData = await this.loadAllData();

    // Map filter names to record fields
    const filterMap = {
      'Type': '_type',
      'Statement': '_statement',
      'Rollup': 'rollup',
      'Account': 'account',
      'Department': 'department',
      'Vendor': 'vendor',
      'Month': 'month',
      'Quarter': 'quarter',
      'Year': 'year',
      'Product': 'product',
      'Metric': 'rollup', // Metric maps to rollup for convenience
      'MetricName': 'metricName',
      'MetricType': 'metricType'
    };

    let filtered = allData;

    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;

      const field = filterMap[key] || key.toLowerCase();
      const filterVal = value.toString().toLowerCase();

      filtered = filtered.filter(row => {
        const rowVal = row[field]?.toString().toLowerCase();
        if (!rowVal) return false;

        // Exact match for type, month, quarter, year
        if (['_type', 'month', 'quarter', 'year'].includes(field)) {
          return rowVal === filterVal;
        }
        // Partial match for others
        return rowVal === filterVal || rowVal.includes(filterVal);
      });
    }

    // Aggregate by rollup (main grouping)
    const rollupTotals = {};
    for (const row of filtered) {
      const key = row.rollup || row.metricName || 'Unknown';
      rollupTotals[key] = (rollupTotals[key] || 0) + (row.value || 0);
    }

    // Aggregate by department
    const departmentTotals = {};
    for (const row of filtered) {
      if (row.department) {
        departmentTotals[row.department] = (departmentTotals[row.department] || 0) + (row.value || 0);
      }
    }

    // Aggregate by account
    const accountTotals = {};
    for (const row of filtered) {
      if (row.account) {
        accountTotals[row.account] = (accountTotals[row.account] || 0) + (row.value || 0);
      }
    }

    // Aggregate by month (ordered)
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTotalsRaw = {};
    for (const row of filtered) {
      if (row.month) {
        monthlyTotalsRaw[row.month] = (monthlyTotalsRaw[row.month] || 0) + (row.value || 0);
      }
    }
    // Sort by month order
    const monthlyTotals = {};
    for (const month of monthOrder) {
      if (monthlyTotalsRaw[month] !== undefined) {
        monthlyTotals[month] = monthlyTotalsRaw[month];
      }
    }

    // Aggregate by quarter (ordered)
    const quarterOrder = ['Q1', 'Q2', 'Q3', 'Q4'];
    const quarterlyTotalsRaw = {};
    for (const row of filtered) {
      if (row.quarter) {
        quarterlyTotalsRaw[row.quarter] = (quarterlyTotalsRaw[row.quarter] || 0) + (row.value || 0);
      }
    }
    const quarterlyTotals = {};
    for (const q of quarterOrder) {
      if (quarterlyTotalsRaw[q] !== undefined) {
        quarterlyTotals[q] = quarterlyTotalsRaw[q];
      }
    }

    const totalAmount = filtered.reduce((sum, r) => sum + (r.value || 0), 0);

    // Debug: show breakdown by source tab
    const byTab = {};
    for (const row of filtered) {
      const tab = row._tab || 'unknown';
      if (!byTab[tab]) byTab[tab] = { count: 0, total: 0 };
      byTab[tab].count++;
      byTab[tab].total += row.value || 0;
    }
    console.log('[Sheets] Query results by source tab:', JSON.stringify(byTab));

    return {
      filters_applied: filters,
      row_count: filtered.length,
      total_amount: totalAmount,
      rollup_totals: rollupTotals,
      monthly_totals: Object.keys(monthlyTotals).length > 0 ? monthlyTotals : undefined,
      quarterly_totals: Object.keys(quarterlyTotals).length > 0 ? quarterlyTotals : undefined,
      department_totals: Object.keys(departmentTotals).length > 0 ? departmentTotals : undefined,
      account_totals: Object.keys(accountTotals).length > 20 ? 'Too many accounts to display' : accountTotals,
      sample_rows: filtered.slice(0, 5).map(r => ({
        rollup: r.rollup || r.metricName,
        account: r.account,
        department: r.department,
        month: r.month,
        quarter: r.quarter,
        year: r.year,
        value: r.value,
        type: r._type
      }))
    };
  }

  /**
   * Variance analysis: compare budget vs actuals
   */
  async varianceAnalysis(filters = {}) {
    const { Year, Quarter, Month, Rollup, Statement, Department } = filters;

    if (!Year) {
      throw new Error('Year is required for variance analysis');
    }

    const baseFilters = {};
    if (Year) baseFilters.Year = Year;
    if (Quarter) baseFilters.Quarter = Quarter;
    if (Month) baseFilters.Month = Month;
    if (Rollup) baseFilters.Rollup = Rollup;
    if (Statement) baseFilters.Statement = Statement;
    if (Department) baseFilters.Department = Department;

    const [budgetData, actualData] = await Promise.all([
      this.query({ ...baseFilters, Type: 'budget' }),
      this.query({ ...baseFilters, Type: 'actuals' })
    ]);

    // Get all unique rollups from both datasets
    const allRollups = new Set([
      ...Object.keys(budgetData.rollup_totals || {}),
      ...Object.keys(actualData.rollup_totals || {})
    ]);

    const variances = [];
    for (const rollup of allRollups) {
      const budget = budgetData.rollup_totals?.[rollup] || 0;
      const actual = actualData.rollup_totals?.[rollup] || 0;
      const variance = actual - budget;
      const variancePct = budget !== 0 ? (variance / Math.abs(budget)) * 100 : null;

      // Determine if favorable (revenue positive is good, expense negative is good)
      const isRevenue = rollup.toLowerCase().includes('revenue');
      const favorable = isRevenue ? variance >= 0 : variance <= 0;

      variances.push({
        rollup,
        budget,
        actual,
        variance,
        variance_pct: variancePct !== null ? variancePct.toFixed(1) + '%' : 'N/A',
        favorable: favorable ? 'Favorable' : 'Unfavorable'
      });
    }

    // Sort by absolute variance descending
    variances.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

    const totalBudget = Object.values(budgetData.rollup_totals || {}).reduce((a, b) => a + b, 0);
    const totalActual = Object.values(actualData.rollup_totals || {}).reduce((a, b) => a + b, 0);
    const totalVariance = totalActual - totalBudget;

    return {
      period: { Year, Quarter, Month },
      filters_applied: baseFilters,
      summary: {
        total_budget: totalBudget,
        total_actual: totalActual,
        total_variance: totalVariance,
        total_variance_pct: totalBudget !== 0 ? ((totalVariance / Math.abs(totalBudget)) * 100).toFixed(1) + '%' : 'N/A'
      },
      variances: variances.slice(0, 25),
      top_favorable: variances.filter(v => v.favorable === 'Favorable').slice(0, 5),
      top_unfavorable: variances.filter(v => v.favorable === 'Unfavorable').slice(0, 5)
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cachedTabs = {};
    this.cacheTime = null;
    console.log('[Sheets] Cache cleared');
  }
}

module.exports = new GoogleSheetsClient();
