// ============================================================
// CHARTCONFIG.JS - Chart.js Initializers & Theme Configurations
// ============================================================

let degradationChartInstance = null;
let breakdownChartInstance = null;
let sensitivityChartInstance = null;
let mlConfidenceChartInstance = null;

const THEME = {
  cyan: '#00D4FF',
  cyanDim: 'rgba(0, 212, 255, 0.25)',
  green: '#00FF88',
  greenDim: '#00CC66',
  amber: '#FFB454',
  red: '#FF5C5C',
  grid: 'rgba(61, 77, 98, 0.35)',
  text: '#B0B8C1',
  textFaint: '#7A8491',
  fontMono: 'JetBrains Mono',
  fontSans: 'Inter'
};

/**
 * 1. Semi-Empirical 10-Year Degradation Trajectory Chart
 */
function initDegradationChart(canvasId = 'degradationChart') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (degradationChartInstance) {
    degradationChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  const labels = ['Yr 0', 'Yr 1', 'Yr 2', 'Yr 3', 'Yr 4', 'Yr 5', 'Yr 6', 'Yr 7', 'Yr 8', 'Yr 9', 'Yr 10'];

  degradationChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Baseline (Standard 25°C, 0% Fast-Charge)',
          data: [100, 97.4, 95.3, 93.6, 92.1, 90.7, 89.5, 88.3, 87.2, 86.2, 85.3],
          borderColor: THEME.textFaint,
          borderDash: [4, 4],
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
          tension: 0.25
        },
        {
          label: 'Current Simulation Scenario',
          data: [],
          borderColor: THEME.cyan,
          backgroundColor: 'rgba(0, 212, 255, 0.12)',
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: THEME.cyan,
          borderWidth: 2.5,
          fill: true,
          tension: 0.3
        },
        {
          label: 'Warning Zone (80% SoH)',
          data: new Array(11).fill(80),
          borderColor: THEME.amber,
          borderDash: [3, 3],
          pointRadius: 0,
          borderWidth: 1,
          fill: false
        },
        {
          label: 'Second-Life Retirement (70% SoH)',
          data: new Array(11).fill(70),
          borderColor: THEME.red,
          borderDash: [3, 3],
          pointRadius: 0,
          borderWidth: 1,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          min: 50,
          max: 100,
          grid: { color: THEME.grid },
          ticks: { color: THEME.text, font: { family: THEME.fontMono, size: 11 }, stepSize: 10 },
          title: { display: true, text: 'State of Health (SoH %)', color: THEME.text }
        },
        x: {
          grid: { color: THEME.grid },
          ticks: { color: THEME.text, font: { family: THEME.fontMono, size: 11 } },
          title: { display: true, text: 'Operating Lifespan (Years)', color: THEME.text }
        }
      },
      plugins: {
        legend: {
          display: true,
          labels: { color: THEME.text, boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          backgroundColor: 'rgba(26, 35, 50, 0.95)',
          borderColor: THEME.cyan,
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: THEME.text,
          callbacks: {
            label: (item) => `${item.dataset.label}: ${item.raw ? item.raw.toFixed(1) : ''}%`
          }
        }
      }
    }
  });

  return degradationChartInstance;
}

/**
 * 2. Calendar vs Cycle Aging Breakdown Chart (Stacked Bar)
 */
function initBreakdownChart(canvasId = 'breakdownChart') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (breakdownChartInstance) {
    breakdownChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  const labels = ['Yr 0', 'Yr 1', 'Yr 2', 'Yr 3', 'Yr 4', 'Yr 5', 'Yr 6', 'Yr 7', 'Yr 8', 'Yr 9', 'Yr 10'];

  breakdownChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Calendar Aging Loss (Temp/Time)',
          data: [],
          backgroundColor: THEME.cyanDim,
          borderColor: THEME.cyan,
          borderWidth: 1,
          stack: 'loss'
        },
        {
          label: 'Cycle Aging Loss (Usage/C-Rate)',
          data: [],
          backgroundColor: 'rgba(255, 180, 84, 0.45)',
          borderColor: THEME.amber,
          borderWidth: 1,
          stack: 'loss'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      scales: {
        x: {
          stacked: true,
          grid: { color: THEME.grid },
          ticks: { color: THEME.text, font: { family: THEME.fontMono, size: 10 } }
        },
        y: {
          stacked: true,
          grid: { color: THEME.grid },
          ticks: { color: THEME.text, font: { family: THEME.fontMono, size: 10 } },
          title: { display: true, text: 'Cumulative Capacity Loss (%)', color: THEME.text }
        }
      },
      plugins: {
        legend: {
          display: true,
          labels: { color: THEME.text, boxWidth: 12, font: { size: 11 } }
        }
      }
    }
  });

  return breakdownChartInstance;
}

/**
 * 3. Sensitivity / Tornado Chart (Horizontal Bar)
 */
function initSensitivityChart(canvasId = 'sensitivityChart') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (sensitivityChartInstance) {
    sensitivityChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');

  sensitivityChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Fast Charge %', 'Ambient Temp', 'Daily Distance'],
      datasets: [
        {
          label: 'Year-10 SoH Impact Range (%)',
          data: [],
          backgroundColor: 'rgba(0, 255, 136, 0.35)',
          borderColor: THEME.green,
          borderWidth: 1.5,
          borderRadius: 4
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      scales: {
        x: {
          min: 0,
          max: 40,
          grid: { color: THEME.grid },
          ticks: { color: THEME.text, font: { family: THEME.fontMono, size: 10 } },
          title: { display: true, text: 'Degradation Swing (Δ SoH %)', color: THEME.text }
        },
        y: {
          grid: { display: false },
          ticks: { color: THEME.text, font: { family: THEME.fontMono, size: 11 } }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => `Sensitivity Impact: ${item.raw.toFixed(1)}% SoH variation`
          }
        }
      }
    }
  });

  return sensitivityChartInstance;
}

/**
 * 4. Machine Learning Confidence Interval Chart
 * Combines observed historical data, future predictions, and shaded confidence band.
 */
function initMLConfidenceChart(canvasId = 'mlConfidenceChart') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (mlConfidenceChartInstance) {
    mlConfidenceChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');

  mlConfidenceChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Observed Telemetry SoH (Historical)',
          data: [],
          borderColor: THEME.green,
          backgroundColor: THEME.green,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
          tension: 0.2
        },
        {
          label: 'ML Forecast Trendline',
          data: [],
          borderColor: THEME.cyan,
          borderDash: [6, 4],
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.25
        },
        {
          label: 'Upper 95% Confidence Bound',
          data: [],
          borderColor: 'transparent',
          pointRadius: 0,
          fill: '+1', // fills to lower bound dataset
          backgroundColor: 'rgba(0, 212, 255, 0.14)'
        },
        {
          label: 'Lower 95% Confidence Bound',
          data: [],
          borderColor: 'transparent',
          pointRadius: 0,
          fill: false
        },
        {
          label: '75% SoH Threshold',
          data: [],
          borderColor: THEME.amber,
          borderDash: [2, 2],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          min: 60,
          max: 102,
          grid: { color: THEME.grid },
          ticks: { color: THEME.text, font: { family: THEME.fontMono, size: 11 }, stepSize: 5 },
          title: { display: true, text: 'State of Health (SoH %)', color: THEME.text }
        },
        x: {
          grid: { color: THEME.grid },
          ticks: { color: THEME.text, maxTicksLimit: 12, font: { family: THEME.fontMono, size: 10 } }
        }
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: THEME.text,
            boxWidth: 12,
            font: { size: 11 },
            filter: (legendItem) => legendItem.text !== 'Lower 95% Confidence Bound'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(26, 35, 50, 0.95)',
          borderColor: THEME.cyan,
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: THEME.text
        }
      }
    }
  });

  return mlConfidenceChartInstance;
}
