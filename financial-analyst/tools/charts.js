// Chart Generation using QuickChart.io
// Generates chart image URLs that Slack can render inline

const QUICKCHART_BASE = 'https://quickchart.io/chart';

/**
 * Format a number for chart labels (e.g., 1234567 -> "1.2M")
 */
function formatValue(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return (value / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return (value / 1000).toFixed(0) + 'K';
  return value.toFixed(0);
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
  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: title || 'Value',
        data: values,
        backgroundColor: color
      }]
    },
    options: {
      plugins: {
        title: {
          display: !!title,
          text: title,
          font: { size: 16 }
        },
        legend: { display: false },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'top',
          formatter: (v) => formatValue(v),
          font: { size: 10 }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => formatValue(v)
          }
        }
      }
    }
  };

  return `${QUICKCHART_BASE}?w=600&h=300&c=${encodeURIComponent(JSON.stringify(config))}`;
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
  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: title || 'Value',
        data: values,
        borderColor: color,
        backgroundColor: color + '33',
        fill: true,
        tension: 0.1
      }]
    },
    options: {
      plugins: {
        title: {
          display: !!title,
          text: title,
          font: { size: 16 }
        },
        legend: { display: false },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'top',
          formatter: (v) => formatValue(v),
          font: { size: 10 }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => formatValue(v)
          }
        }
      }
    }
  };

  return `${QUICKCHART_BASE}?w=600&h=300&c=${encodeURIComponent(JSON.stringify(config))}`;
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
  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Budget',
          data: budgetValues,
          backgroundColor: '#9CA3AF'
        },
        {
          label: 'Actual',
          data: actualValues,
          backgroundColor: '#4A90A4'
        }
      ]
    },
    options: {
      plugins: {
        title: {
          display: !!title,
          text: title,
          font: { size: 16 }
        },
        legend: { display: true },
        datalabels: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => formatValue(v)
          }
        }
      }
    }
  };

  return `${QUICKCHART_BASE}?w=600&h=300&c=${encodeURIComponent(JSON.stringify(config))}`;
}

module.exports = {
  barChart,
  lineChart,
  comparisonChart,
  formatValue
};
