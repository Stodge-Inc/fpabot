// Tool Registry and Executor - Google Sheets Only

const googleSheets = require('./google-sheets');

// Map tool names to their implementations
const toolImplementations = {
  // Get context/instructions for understanding the data
  'get_budget_context': async () => {
    const context = await googleSheets.getBudgetContext();
    if (!context) {
      return {
        error: 'Could not read budget context tab. Make sure "Context for Claude" tab exists.',
        is_error: true
      };
    }
    return {
      source: 'Google Sheets - Budget Context',
      context: context,
      hint: 'This explains the budget data structure. Use get_budget_data or get_actuals_data to query actual numbers.'
    };
  },

  // Query budget data
  'get_budget_data': async (input) => googleSheets.getBudgetData(input),

  // Query actuals data (same format as budget)
  'get_actuals_data': async (input) => googleSheets.getActualsData(input),

  // List available sheets and tabs
  'list_available_sheets': async (input) => googleSheets.listAvailableSheets(input),

  // Compare budget vs actuals
  'compare_budget_vs_actuals': async (input) => {
    const { metric, month, quarter, year, department } = input;

    // Get budget data
    const budgetResult = await googleSheets.getBudgetData({ metric, month, quarter, year, department });

    // Get actuals data
    const actualsResult = await googleSheets.getActualsData({ metric, month, quarter, year, department });

    if (budgetResult.is_error) {
      return { error: `Budget query failed: ${budgetResult.error}`, is_error: true };
    }
    if (actualsResult.is_error) {
      return { error: `Actuals query failed: ${actualsResult.error}`, is_error: true };
    }

    const budgetTotal = budgetResult.total_amount || 0;
    const actualsTotal = actualsResult.total_amount || 0;
    const variance = actualsTotal - budgetTotal;
    const variancePercent = budgetTotal !== 0 ? ((variance / Math.abs(budgetTotal)) * 100).toFixed(1) : 'N/A';

    return {
      source: 'Google Sheets - Budget vs Actuals',
      query: { metric, month, quarter, year, department },
      budget: {
        total: budgetTotal,
        row_count: budgetResult.row_count,
        metric_totals: budgetResult.metric_totals
      },
      actuals: {
        total: actualsTotal,
        row_count: actualsResult.row_count,
        metric_totals: actualsResult.metric_totals
      },
      variance: {
        amount: variance,
        percent: variancePercent,
        favorable: variance > 0 ? 'Over budget' : variance < 0 ? 'Under budget' : 'On budget'
      }
    };
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
    console.log(`Executing tool: ${name}`, JSON.stringify(input));
    const result = await tool(input);
    console.log(`Tool ${name} completed:`, result.is_error ? result.error : 'success');
    return result;
  } catch (error) {
    console.error(`Tool ${name} error:`, error);
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
