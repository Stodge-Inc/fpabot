// Tool Registry and Executor - Google Sheets with Aleph format

const sheetsClient = require('./google-sheets-consolidated');
const charts = require('./charts');

// Map tool names to their implementations
const toolImplementations = {
  // Explore what's in the data
  'explore_financial_data': async (input) => {
    const { dimension, filter } = input;

    if (!dimension) {
      return {
        error: 'dimension is required. Valid options: Type, Statement, Rollup, Account, Department, Vendor, Month, Quarter, Year, Product, Metric Name, Metric Type',
        is_error: true
      };
    }

    try {
      const result = await sheetsClient.explore(dimension, filter || {});
      return {
        source: 'Google Sheets - Budget & Actuals',
        ...result
      };
    } catch (error) {
      return {
        error: `Failed to explore data: ${error.message}`,
        is_error: true
      };
    }
  },

  // Query financial data with filters
  'query_financial_data': async (input) => {
    const { Type, Statement, Rollup, Account, Department, Vendor, Month, Quarter, Year, Product, MetricName, MetricType } = input;

    // Build filters object
    const filters = {};
    if (Type) filters.Type = Type;
    if (Statement) filters.Statement = Statement;
    if (Rollup) filters.Rollup = Rollup;
    if (Account) filters.Account = Account;
    if (Department) filters.Department = Department;
    if (Vendor) filters.Vendor = Vendor;
    if (Month) filters.Month = Month;
    if (Quarter) filters.Quarter = Quarter;
    if (Year) filters.Year = Year;
    if (Product) filters.Product = Product;
    if (MetricName) filters.MetricName = MetricName;
    if (MetricType) filters.MetricType = MetricType;

    // Warn if Type is not specified
    if (!Type) {
      console.warn('[Tools] query_financial_data called without Type filter - results will mix Budget and Actual');
    }

    try {
      const result = await sheetsClient.query(filters);
      return {
        source: 'Google Sheets - Budget & Actuals',
        warning: !Type ? 'No Type filter specified - results include both Budget and Actual data' : undefined,
        ...result
      };
    } catch (error) {
      return {
        error: `Failed to query data: ${error.message}`,
        is_error: true
      };
    }
  },

  // Compare budget vs actuals
  'variance_analysis': async (input) => {
    const { Rollup, Statement, Department, Quarter, Year, Month } = input;

    if (!Year) {
      return {
        error: 'Year is required for variance analysis',
        is_error: true
      };
    }

    try {
      const result = await sheetsClient.varianceAnalysis({
        Rollup,
        Statement,
        Department,
        Quarter,
        Year,
        Month
      });
      return {
        source: 'Google Sheets - Variance Analysis',
        ...result
      };
    } catch (error) {
      return {
        error: `Failed to perform variance analysis: ${error.message}`,
        is_error: true
      };
    }
  },

  // Generate a chart image
  'generate_chart': async (input) => {
    const { chart_type, title, labels, values, budget_values, actual_values } = input;

    try {
      let chartUrl;

      switch (chart_type) {
        case 'bar':
          chartUrl = charts.barChart({ title, labels, values });
          break;
        case 'line':
          chartUrl = charts.lineChart({ title, labels, values });
          break;
        case 'comparison':
          chartUrl = charts.comparisonChart({
            title,
            labels,
            budgetValues: budget_values,
            actualValues: actual_values
          });
          break;
        default:
          chartUrl = charts.barChart({ title, labels, values });
      }

      return {
        chart_url: chartUrl,
        chart_type,
        title,
        instruction: 'Include this URL in your response. Slack will render it as an image.'
      };
    } catch (error) {
      return {
        error: `Failed to generate chart: ${error.message}`,
        is_error: true
      };
    }
  }
};

/**
 * Execute a tool by name with the given input
 */
async function execute(name, input) {
  const tool = toolImplementations[name];

  if (!tool) {
    return {
      error: `Unknown tool: ${name}`,
      is_error: true,
      available_tools: Object.keys(toolImplementations)
    };
  }

  try {
    console.log(`[Tools] Executing: ${name}`, JSON.stringify(input));
    const result = await tool(input);
    console.log(`[Tools] ${name} completed:`, result.is_error ? result.error : 'success');
    return result;
  } catch (error) {
    console.error(`[Tools] ${name} error:`, error);
    return {
      error: `Tool execution failed: ${error.message}`,
      is_error: true,
      tool_name: name,
      input
    };
  }
}

/**
 * Get list of available tool names
 */
function getAvailableTools() {
  return Object.keys(toolImplementations);
}

module.exports = {
  execute,
  getAvailableTools
};
