const fileInput = document.getElementById('file-input');
const sampleBtn = document.getElementById('sample-btn');
const statsEl = document.getElementById('stats');
const numericStatsEl = document.getElementById('numeric-stats');
const categoryStatsEl = document.getElementById('category-stats');
const metaEl = document.getElementById('meta');
const chart = document.getElementById('chart');
const chartNote = document.getElementById('chart-note');

let dataset = null;

function renderNumericStats(summary, records) {
  if (!summary.numeric.length) {
    numericStatsEl.textContent = 'No numeric columns detected.';
    return;
  }

  const stats = computeNumericStats(summary.headers, records, summary.numeric);
  const rows = summary.numeric
    .map((col) => {
      const stat = stats[col];
      if (!stat) return null;
      return `<li><strong>${col}</strong>: min ${formatNumber(stat.min)}, max ${formatNumber(
        stat.max
      )}, avg ${formatNumber(stat.mean)}</li>`;
    })
    .filter(Boolean);

  numericStatsEl.innerHTML = `<ul>${rows.join('')}</ul>`;
  return stats;
}

function renderCategoryStats(summary, records) {
  if (!summary.textual.length) {
    categoryStatsEl.textContent = 'No text columns detected.';
    return;
  }

  const stats = computeCategoryStats(summary.headers, records, summary.textual);
  const blocks = summary.textual.map((col) => {
    const pairs = stats[col];
    if (!pairs || !pairs.length) return `<p><strong>${col}</strong>: no values.</p>`;
    const list = pairs
      .map(([value, count]) => `<li>${value} <span class="badge">${count}</span></li>`)
      .join('');
    return `<div class="note"><strong>${col}</strong><ul>${list}</ul></div>`;
  });
  categoryStatsEl.innerHTML = blocks.join('');
  return stats;
}

function renderChart(numericStats) {
  if (!numericStats || !Object.keys(numericStats).length) {
    chartNote.textContent = 'No numeric data available for charting.';
    return;
  }
  const best = bestNumericColumn(numericStats);
  if (!best) return;
  const [label, stat] = best;
  const dataPairs = [
    ['Min', stat.min],
    ['Mean', stat.mean],
    ['Max', stat.max],
  ];
  drawBarChart(chart, dataPairs, '#00bcd4');
  chartNote.textContent = `Visualizing ${label}`;
}

function showData(name, headers, records) {
  dataset = { name, headers, records };
  const summary = summarizeDataset(headers, records);
  summary.headers = headers;
  populateStats(statsEl, summary);
  updateMeta(metaEl, name, headers);
  const numericStats = renderNumericStats(summary, records);
  renderCategoryStats(summary, records);
  renderChart(numericStats);
  saveDataset(name, headers, records);
}

function handleFileLoad(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const { headers, records } = parseCSV(reader.result);
    showData(file.name, headers, records);
  };
  reader.readAsText(file);
}

async function handleSample() {
  const { name, headers, records } = await loadSampleDataset();
  showData(name, headers, records);
}

function init() {
  const stored = loadStoredDataset();
  if (stored) {
    showData(stored.name, stored.headers, stored.records);
    return;
  }
  handleSample();
}

fileInput.addEventListener('change', handleFileLoad);
sampleBtn.addEventListener('click', handleSample);

init();
