// Chart Generation using QuickChart.io
// Generates chart image URLs that Slack can render inline

const QUICKCHART_BASE = 'https://quickchart.io/chart';
const QUICKCHART_SHORT_URL = 'https://quickchart.io/chart/create';

// Postscript brand colors
const COLORS = {
  // Primary palette
  primary: {
    blue: '#007AFF',
    teal: '#23D1AB',
    green: '#2DE34C',
    yellow: '#FFC300',
    orange: '#FF5C00',
    red: '#FF2D55',
    pink: '#FF0099',
    purple: '#5724E9'
  },
  // Light variants
  light: {
    blue: '#99CAFF',
    teal: '#B5EFE3',
    green: '#96F1A6',
    yellow: '#FFE180',
    orange: '#FFD6BF',
    red: '#FFCBD5',
    pink: '#FFBFE6',
    purple: '#C7B6F8'
  },
  // Dark variants
  dark: {
    blue: '#004999',
    teal: '#147761',
    green: '#1C8E30',
    yellow: '#BF9200',
    orange: '#AA3D00',
    red: '#AA1E39',
    pink: '#AA0066',
    purple: '#2C1275'
  }
};

// Default chart color (Postscript purple - primary brand color)
const DEFAULT_COLOR = COLORS.primary.purple;

// QuickChart callback string for formatting values as currency
// Using function() syntax for better QuickChart compatibility
const CURRENCY_FORMATTER = "function(v) { var abs = Math.abs(v); if (abs >= 1000000) return '$' + (v/1000000).toFixed(1) + 'M'; if (abs >= 1000) return '$' + (v/1000).toFixed(0) + 'K'; return '$' + v.toFixed(0); }";

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
function barChart({ title, labels, values, color = DEFAULT_COLOR }) {
  // Convert to thousands for cleaner Y-axis (shows $0, $100K, $200K, etc.)
  const valuesInK = values.map(v => Math.round(v / 1000));
  const maxVal = Math.max(...valuesInK);
  const yAxisMax = Math.ceil(maxVal / 100) * 100; // Round up to nearest 100K
  const tickStep = Math.ceil(yAxisMax / 5 / 50) * 50; // Nice round steps

  const configStr = `{
    "type": "bar",
    "data": {
      "labels": ${JSON.stringify(labels)},
      "datasets": [{
        "label": ${JSON.stringify(title || 'Value')},
        "data": ${JSON.stringify(valuesInK)},
        "backgroundColor": "${color}",
        "borderRadius": 4,
        "borderSkipped": false
      }]
    },
    "options": {
      "plugins": {
        "title": {
          "display": ${!!title},
          "text": ${JSON.stringify(title)},
          "font": { "size": 16, "family": "system-ui, -apple-system, sans-serif", "weight": "600" },
          "padding": { "bottom": 16 }
        },
        "legend": { "display": false },
        "datalabels": {
          "display": true,
          "anchor": "end",
          "align": "top",
          "formatter": function(v) { return '$' + v + 'K'; },
          "font": { "size": 10, "family": "system-ui, -apple-system, sans-serif", "weight": "500" },
          "color": "#374151"
        }
      },
      "scales": {
        "y": {
          "beginAtZero": true,
          "max": ${yAxisMax},
          "grid": { "color": "#E5E7EB", "drawBorder": false },
          "border": { "display": false },
          "title": { "display": true, "text": "$ Thousands", "font": { "size": 11 }, "color": "#9CA3AF" },
          "ticks": {
            "stepSize": ${tickStep},
            "font": { "size": 11, "family": "system-ui, -apple-system, sans-serif" },
            "color": "#6B7280",
            "padding": 8
          }
        },
        "x": {
          "grid": { "display": false },
          "border": { "display": false },
          "ticks": {
            "font": { "size": 11, "family": "system-ui, -apple-system, sans-serif" },
            "color": "#6B7280"
          }
        }
      },
      "layout": { "padding": { "top": 30, "right": 10 } }
    }
  }`;

  return `${QUICKCHART_BASE}?w=700&h=350&bkg=white&c=${encodeURIComponent(configStr)}`;
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
function lineChart({ title, labels, values, color = DEFAULT_COLOR }) {
  // Convert to thousands for cleaner Y-axis
  const valuesInK = values.map(v => Math.round(v / 1000));
  const maxVal = Math.max(...valuesInK);
  const yAxisMax = Math.ceil(maxVal / 100) * 100;
  const tickStep = Math.ceil(yAxisMax / 5 / 50) * 50;

  const configStr = `{
    "type": "line",
    "data": {
      "labels": ${JSON.stringify(labels)},
      "datasets": [{
        "label": ${JSON.stringify(title || 'Value')},
        "data": ${JSON.stringify(valuesInK)},
        "borderColor": "${color}",
        "backgroundColor": "${color}20",
        "fill": true,
        "tension": 0.3,
        "borderWidth": 2.5,
        "pointRadius": 4,
        "pointBackgroundColor": "${color}",
        "pointBorderColor": "white",
        "pointBorderWidth": 2
      }]
    },
    "options": {
      "plugins": {
        "title": {
          "display": ${!!title},
          "text": ${JSON.stringify(title)},
          "font": { "size": 16, "family": "system-ui, -apple-system, sans-serif", "weight": "600" },
          "padding": { "bottom": 16 }
        },
        "legend": { "display": false },
        "datalabels": {
          "display": true,
          "anchor": "end",
          "align": "top",
          "formatter": function(v) { return '$' + v + 'K'; },
          "font": { "size": 10, "family": "system-ui, -apple-system, sans-serif", "weight": "500" },
          "color": "#374151"
        }
      },
      "scales": {
        "y": {
          "beginAtZero": true,
          "max": ${yAxisMax},
          "grid": { "color": "#E5E7EB", "drawBorder": false },
          "border": { "display": false },
          "title": { "display": true, "text": "$ Thousands", "font": { "size": 11 }, "color": "#9CA3AF" },
          "ticks": {
            "stepSize": ${tickStep},
            "font": { "size": 11, "family": "system-ui, -apple-system, sans-serif" },
            "color": "#6B7280",
            "padding": 8
          }
        },
        "x": {
          "grid": { "display": false },
          "border": { "display": false },
          "ticks": {
            "font": { "size": 11, "family": "system-ui, -apple-system, sans-serif" },
            "color": "#6B7280"
          }
        }
      },
      "layout": { "padding": { "top": 30, "right": 10 } }
    }
  }`;

  return `${QUICKCHART_BASE}?w=700&h=350&bkg=white&c=${encodeURIComponent(configStr)}`;
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
          "backgroundColor": "${COLORS.primary.teal}",
          "borderRadius": 4,
          "borderSkipped": false
        },
        {
          "label": "Actual",
          "data": ${JSON.stringify(actualValues)},
          "backgroundColor": "${COLORS.primary.purple}",
          "borderRadius": 4,
          "borderSkipped": false
        }
      ]
    },
    "options": {
      "plugins": {
        "title": {
          "display": ${!!title},
          "text": ${JSON.stringify(title)},
          "font": { "size": 16, "family": "system-ui, -apple-system, sans-serif", "weight": "600" },
          "padding": { "bottom": 16 }
        },
        "legend": {
          "display": true,
          "position": "top",
          "align": "end",
          "labels": {
            "usePointStyle": true,
            "pointStyle": "rectRounded",
            "font": { "size": 11, "family": "system-ui, -apple-system, sans-serif" },
            "color": "#374151",
            "padding": 16
          }
        },
        "datalabels": {
          "display": true,
          "anchor": "end",
          "align": "top",
          "formatter": ${CURRENCY_FORMATTER},
          "font": { "size": 9, "family": "system-ui, -apple-system, sans-serif", "weight": "500" },
          "color": "#374151"
        }
      },
      "scales": {
        "y": {
          "beginAtZero": true,
          "grid": { "color": "#E5E7EB", "drawBorder": false },
          "border": { "display": false },
          "ticks": {
            "callback": ${CURRENCY_FORMATTER},
            "maxTicksLimit": 6,
            "font": { "size": 11, "family": "system-ui, -apple-system, sans-serif" },
            "color": "#6B7280",
            "padding": 8
          }
        },
        "x": {
          "grid": { "display": false },
          "border": { "display": false },
          "ticks": {
            "font": { "size": 11, "family": "system-ui, -apple-system, sans-serif" },
            "color": "#6B7280"
          }
        }
      },
      "layout": { "padding": { "top": 30, "right": 10 } }
    }
  }`;

  return `${QUICKCHART_BASE}?w=700&h=350&bkg=white&c=${encodeURIComponent(configStr)}`;
}

module.exports = {
  barChart,
  lineChart,
  comparisonChart,
  formatValue
};
