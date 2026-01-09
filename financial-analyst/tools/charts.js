// Chart Generation using QuickChart.io
// Generates chart image URLs that Slack can render inline

const QUICKCHART_BASE = 'https://quickchart.io/chart';

// QuickChart callback string for formatting values as currency
// This gets serialized into the chart config JSON
const CURRENCY_FORMATTER = "(v) => { const abs = Math.abs(v); if (abs >= 1000000) return '$' + (v/1000000).toFixed(1) + 'M'; if (abs >= 1000) return '$' + (v/1000).toFixed(0) + 'K'; return '$' + v.toFixed(0); }";

/**
 * Format a number for chart labels (e.g., 1234567 -> "$1.2M")
 */
function formatValue(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return '$' + (value / 1000).toFixed(0) + 'K';
  return '$' + value.toFixed(0);
}

/**
 * Generate a bar chart URL
 * @param {object} options
 * @param {string} options.title - Chart title
 * @param {string[]} options.labels - X-axis labels (e.g., ['Jan', 'Feb', 'Mar'])
 * @param {number[]} options.values - Data values
 * @param {string} options.color - Bar color (default: '#4A90A4')
 * @returns {string} - QuickChart URL
 */
function barChart({ title, labels, values, color = '#4A90A4' }) {
  // Build config as string to include callback functions
  const configStr = `{
    "type": "bar",
    "data": {
      "labels": ${JSON.stringify(labels)},
      "datasets": [{
        "label": ${JSON.stringify(title || 'Value')},
        "data": ${JSON.stringify(values)},
        "backgroundColor": "${color}"
      }]
    },
    "options": {
      "plugins": {
        "title": {
          "display": ${!!title},
          "text": ${JSON.stringify(title)},
          "font": { "size": 16 }
        },
        "legend": { "display": false },
        "datalabels": {
          "display": true,
          "anchor": "end",
          "align": "top",
          "formatter": ${CURRENCY_FORMATTER},
          "font": { "size": 11, "weight": "bold" }
        }
      },
      "scales": {
        "y": {
          "beginAtZero": true,
          "ticks": {
            "callback": ${CURRENCY_FORMATTER}
          }
        }
      }
    }
  }`;

  return `${QUICKCHART_BASE}?w=600&h=300&c=${encodeURIComponent(configStr)}`;
}

/**
 * Generate a line chart URL
 * @param {object} options
 * @param {string} options.title - Chart title
 * @param {string[]} options.labels - X-axis labels
 * @param {number[]} options.values - Data values
 * @param {string} options.color - Line color (default: '#4A90A4')
 * @returns {string} - QuickChart URL
 */
function lineChart({ title, labels, values, color = '#4A90A4' }) {
  const configStr = `{
    "type": "line",
    "data": {
      "labels": ${JSON.stringify(labels)},
      "datasets": [{
        "label": ${JSON.stringify(title || 'Value')},
        "data": ${JSON.stringify(values)},
        "borderColor": "${color}",
        "backgroundColor": "${color}33",
        "fill": true,
        "tension": 0.1
      }]
    },
    "options": {
      "plugins": {
        "title": {
          "display": ${!!title},
          "text": ${JSON.stringify(title)},
          "font": { "size": 16 }
        },
        "legend": { "display": false },
        "datalabels": {
          "display": true,
          "anchor": "end",
          "align": "top",
          "formatter": ${CURRENCY_FORMATTER},
          "font": { "size": 11, "weight": "bold" }
        }
      },
      "scales": {
        "y": {
          "beginAtZero": true,
          "ticks": {
            "callback": ${CURRENCY_FORMATTER}
          }
        }
      }
    }
  }`;

  return `${QUICKCHART_BASE}?w=600&h=300&c=${encodeURIComponent(configStr)}`;
}

/**
 * Generate a comparison bar chart (budget vs actual)
 * @param {object} options
 * @param {string} options.title - Chart title
 * @param {string[]} options.labels - X-axis labels
 * @param {number[]} options.budgetValues - Budget data
 * @param {number[]} options.actualValues - Actual data
 * @returns {string} - QuickChart URL
 */
function comparisonChart({ title, labels, budgetValues, actualValues }) {
  const configStr = `{
    "type": "bar",
    "data": {
      "labels": ${JSON.stringify(labels)},
      "datasets": [
        {
          "label": "Budget",
          "data": ${JSON.stringify(budgetValues)},
          "backgroundColor": "#9CA3AF"
        },
        {
          "label": "Actual",
          "data": ${JSON.stringify(actualValues)},
          "backgroundColor": "#4A90A4"
        }
      ]
    },
    "options": {
      "plugins": {
        "title": {
          "display": ${!!title},
          "text": ${JSON.stringify(title)},
          "font": { "size": 16 }
        },
        "legend": { "display": true },
        "datalabels": {
          "display": false
        }
      },
      "scales": {
        "y": {
          "beginAtZero": true,
          "ticks": {
            "callback": ${CURRENCY_FORMATTER}
          }
        }
      }
    }
  }`;

  return `${QUICKCHART_BASE}?w=600&h=300&c=${encodeURIComponent(configStr)}`;
}

module.exports = {
  barChart,
  lineChart,
  comparisonChart,
  formatValue
};
