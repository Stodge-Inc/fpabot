// Vega-Lite Chart Renderer
// Renders beautiful charts using Vega-Lite and stores them in Postgres

const crypto = require('crypto');

// Dynamic imports for ESM modules (vega, vega-lite)
let vega = null;
let vegaLite = null;

async function loadVegaModules() {
  if (!vega) {
    vega = await import('vega');
  }
  if (!vegaLite) {
    vegaLite = await import('vega-lite');
  }
}

// Postscript brand colors
const COLORS = {
  purple: '#5724E9',
  purpleLight: '#C7B6F8',
  purpleDark: '#2C1275',
  teal: '#23D1AB',
  tealLight: '#B5EFE3',
  blue: '#007AFF',
  green: '#2DE34C',
  red: '#FF2D55',
  orange: '#FF5C00',
  yellow: '#FFC300'
};

// Color preference order: Purple > Teal > Blue > Green
const COLOR_SEQUENCE = [
  COLORS.purple,
  COLORS.teal,
  COLORS.blue,
  COLORS.green,
  COLORS.orange,
  COLORS.yellow
];

/**
 * Format currency value for display
 */
function formatCurrency(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return '$' + (value / 1000).toFixed(0) + 'K';
  return '$' + value.toFixed(0);
}

/**
 * Format percentage value for display
 */
function formatPercent(value) {
  return value.toFixed(1) + '%';
}

/**
 * Format value based on format type
 */
function formatValue(value, format = 'currency') {
  if (format === 'percent') return formatPercent(value);
  return formatCurrency(value);
}

/**
 * Create a bar chart spec with data labels
 * @param {string} format - 'currency' (default) or 'percent'
 */
function barChartSpec({ title, labels, values, format = 'currency' }) {
  // Pre-format the labels for display
  const data = labels.map((label, i) => ({
    category: label,
    value: values[i],
    label: formatValue(values[i], format)
  }));

  // Y-axis label expression based on format
  const yAxisLabelExpr = format === 'percent'
    ? "datum.value + '%'"
    : "datum.value >= 1000000 ? '$' + datum.value/1000000 + 'M' : datum.value >= 1000 ? '$' + datum.value/1000 + 'K' : '$' + datum.value";

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 600,
    height: 300,
    padding: { top: 30, bottom: 20, left: 20, right: 20 },
    background: 'white',
    title: {
      text: title,
      fontSize: 16,
      fontWeight: 600,
      font: 'system-ui, -apple-system, sans-serif',
      color: '#1F2937'
    },
    data: { values: data },
    layer: [
      {
        mark: {
          type: 'bar',
          cornerRadiusTopLeft: 4,
          cornerRadiusTopRight: 4,
          color: COLORS.purple
        },
        encoding: {
          x: {
            field: 'category',
            type: 'nominal',
            axis: {
              title: null,
              labelFont: 'system-ui, -apple-system, sans-serif',
              labelFontSize: 11,
              labelColor: '#6B7280',
              tickColor: '#E5E7EB',
              domainColor: '#E5E7EB'
            }
          },
          y: {
            field: 'value',
            type: 'quantitative',
            axis: {
              title: null,
              labelFont: 'system-ui, -apple-system, sans-serif',
              labelFontSize: 11,
              labelColor: '#6B7280',
              gridColor: '#E5E7EB',
              tickColor: '#E5E7EB',
              domainColor: '#E5E7EB',
              labelExpr: yAxisLabelExpr
            }
          },
          tooltip: [
            { field: 'category', type: 'nominal', title: 'Period' },
            { field: 'label', type: 'nominal', title: format === 'percent' ? 'Percentage' : 'Amount' }
          ]
        }
      },
      {
        mark: {
          type: 'text',
          dy: -8,
          fontSize: 10,
          fontWeight: 500,
          font: 'system-ui, -apple-system, sans-serif',
          color: '#374151'
        },
        encoding: {
          x: { field: 'category', type: 'nominal' },
          y: { field: 'value', type: 'quantitative' },
          text: { field: 'label', type: 'nominal' }
        }
      }
    ],
    config: {
      view: { stroke: null }
    }
  };
}

/**
 * Create a line chart spec
 * @param {string} format - 'currency' (default) or 'percent'
 */
function lineChartSpec({ title, labels, values, format = 'currency' }) {
  const data = labels.map((label, i) => ({
    category: label,
    value: values[i],
    label: formatValue(values[i], format)
  }));

  const yAxisLabelExpr = format === 'percent'
    ? "datum.value + '%'"
    : "datum.value >= 1000000 ? '$' + datum.value/1000000 + 'M' : datum.value >= 1000 ? '$' + datum.value/1000 + 'K' : '$' + datum.value";

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 600,
    height: 300,
    padding: { top: 20, bottom: 20, left: 20, right: 20 },
    background: 'white',
    title: {
      text: title,
      fontSize: 16,
      fontWeight: 600,
      font: 'system-ui, -apple-system, sans-serif',
      color: '#1F2937'
    },
    data: { values: data },
    layer: [
      {
        mark: {
          type: 'area',
          color: COLORS.purple,
          opacity: 0.1,
          line: { color: COLORS.purple, strokeWidth: 2.5 }
        },
        encoding: {
          x: {
            field: 'category',
            type: 'nominal',
            axis: {
              title: null,
              labelFont: 'system-ui, -apple-system, sans-serif',
              labelFontSize: 11,
              labelColor: '#6B7280',
              tickColor: '#E5E7EB',
              domainColor: '#E5E7EB'
            }
          },
          y: {
            field: 'value',
            type: 'quantitative',
            axis: {
              title: null,
              labelFont: 'system-ui, -apple-system, sans-serif',
              labelFontSize: 11,
              labelColor: '#6B7280',
              gridColor: '#E5E7EB',
              tickColor: '#E5E7EB',
              domainColor: '#E5E7EB',
              labelExpr: yAxisLabelExpr
            }
          }
        }
      },
      {
        mark: {
          type: 'point',
          color: COLORS.purple,
          filled: true,
          size: 60,
          stroke: 'white',
          strokeWidth: 2
        },
        encoding: {
          x: { field: 'category', type: 'nominal' },
          y: { field: 'value', type: 'quantitative' },
          tooltip: [
            { field: 'category', type: 'nominal', title: 'Period' },
            { field: 'label', type: 'nominal', title: format === 'percent' ? 'Percentage' : 'Amount' }
          ]
        }
      }
    ],
    config: {
      view: { stroke: null }
    }
  };
}

/**
 * Create a comparison (budget vs actual) bar chart spec with data labels
 * @param {string} format - 'currency' (default) or 'percent'
 */
function comparisonChartSpec({ title, labels, budgetValues, actualValues, format = 'currency' }) {
  const data = [];
  labels.forEach((label, i) => {
    data.push({ category: label, type: 'Budget', value: budgetValues[i], label: formatValue(budgetValues[i], format) });
    data.push({ category: label, type: 'Actual', value: actualValues[i], label: formatValue(actualValues[i], format) });
  });

  const yAxisLabelExpr = format === 'percent'
    ? "datum.value + '%'"
    : "datum.value >= 1000000 ? '$' + datum.value/1000000 + 'M' : datum.value >= 1000 ? '$' + datum.value/1000 + 'K' : '$' + datum.value";

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 600,
    height: 300,
    padding: { top: 30, bottom: 20, left: 20, right: 20 },
    background: 'white',
    title: {
      text: title,
      fontSize: 16,
      fontWeight: 600,
      font: 'system-ui, -apple-system, sans-serif',
      color: '#1F2937'
    },
    data: { values: data },
    layer: [
      {
        mark: {
          type: 'bar',
          cornerRadiusTopLeft: 4,
          cornerRadiusTopRight: 4
        },
        encoding: {
          x: {
            field: 'category',
            type: 'nominal',
            axis: {
              title: null,
              labelFont: 'system-ui, -apple-system, sans-serif',
              labelFontSize: 11,
              labelColor: '#6B7280',
              tickColor: '#E5E7EB',
              domainColor: '#E5E7EB'
            }
          },
          xOffset: { field: 'type' },
          y: {
            field: 'value',
            type: 'quantitative',
            axis: {
              title: null,
              labelFont: 'system-ui, -apple-system, sans-serif',
              labelFontSize: 11,
              labelColor: '#6B7280',
              gridColor: '#E5E7EB',
              tickColor: '#E5E7EB',
              domainColor: '#E5E7EB',
              labelExpr: yAxisLabelExpr
            }
          },
          color: {
            field: 'type',
            type: 'nominal',
            scale: {
              domain: ['Budget', 'Actual'],
              range: [COLORS.teal, COLORS.purple]
            },
            legend: {
              title: null,
              orient: 'top-right',
              labelFont: 'system-ui, -apple-system, sans-serif',
              labelFontSize: 11,
              symbolType: 'square',
              symbolSize: 100
            }
          },
          tooltip: [
            { field: 'category', type: 'nominal', title: 'Period' },
            { field: 'type', type: 'nominal', title: 'Type' },
            { field: 'label', type: 'nominal', title: format === 'percent' ? 'Percentage' : 'Amount' }
          ]
        }
      },
      {
        mark: {
          type: 'text',
          dy: -8,
          fontSize: 9,
          fontWeight: 500,
          font: 'system-ui, -apple-system, sans-serif',
          color: '#374151'
        },
        encoding: {
          x: { field: 'category', type: 'nominal' },
          xOffset: { field: 'type' },
          y: { field: 'value', type: 'quantitative' },
          text: { field: 'label', type: 'nominal' }
        }
      }
    ],
    config: {
      view: { stroke: null }
    }
  };
}

/**
 * Render a Vega-Lite spec to PNG buffer
 */
async function renderToPng(vlSpec) {
  // Load ESM modules dynamically
  await loadVegaModules();

  // Compile Vega-Lite to Vega
  const vegaSpec = vegaLite.compile(vlSpec).spec;

  // Create a new Vega view
  const view = new vega.View(vega.parse(vegaSpec), { renderer: 'none' });

  // Initialize the view
  await view.initialize();

  // Render to canvas and get PNG buffer
  const canvas = await view.toCanvas();
  return canvas.toBuffer('image/png');
}

/**
 * Generate a unique chart ID
 */
function generateChartId() {
  return crypto.randomUUID();
}

module.exports = {
  COLORS,
  COLOR_SEQUENCE,
  formatCurrency,
  barChartSpec,
  lineChartSpec,
  comparisonChartSpec,
  renderToPng,
  generateChartId
};
