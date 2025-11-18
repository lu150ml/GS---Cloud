const fileInput = document.getElementById('file-input');
const sampleBtn = document.getElementById('sample-btn');
const statsEl = document.getElementById('stats');
const numericStatsEl = document.getElementById('numeric-stats');
const categoryStatsEl = document.getElementById('category-stats');
const metaEl = document.getElementById('meta');
const chart = document.getElementById('chart');
const chartNote = document.getElementById('chart-note');
const chartColumnXSelect = document.getElementById('chart-column-x');
const chartColumnYSelect = document.getElementById('chart-column-y');
const chartTypeSelect = document.getElementById('chart-type');
const pythonChartBtn = document.getElementById('render-python-chart');
const pythonChartStatus = document.getElementById('python-chart-status');
const pythonChartImage = document.getElementById('python-chart-image');

let dataset = null;
let pyodideReady = null;

function renderNumericStats(summary, records) {
  if (!summary.numeric.length) {
    numericStatsEl.textContent = 'Nenhuma coluna numérica detectada.';
    return;
  }

  const stats = computeNumericStats(summary.headers, records, summary.numeric);
  const rows = summary.numeric
    .map((col) => {
      const stat = stats[col];
      if (!stat) return null;
      return `<li><strong>${col}</strong>: min ${formatNumber(stat.min)}, max ${formatNumber(stat.max)}, média ${formatNumber(stat.mean)}</li>`;
    })
    .filter(Boolean);

  numericStatsEl.innerHTML = `<ul>${rows.join('')}</ul>`;
  return stats;
}

function renderCategoryStats(summary, records) {
  if (!summary.textual.length) {
    categoryStatsEl.textContent = 'Nenhuma coluna de texto detectada.';
    return;
  }

  const stats = computeCategoryStats(summary.headers, records, summary.textual);
  const blocks = summary.textual.map((col) => {
    const pairs = stats[col];
    if (!pairs || !pairs.length) return `<p><strong>${col}</strong>: sem valores.</p>`;
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
    chartNote.textContent = 'Nenhum dado numérico disponível para o gráfico.';
    return;
  }
  const best = bestNumericColumn(numericStats);
  if (!best) return;
  const [label, stat] = best;
  const dataPairs = [
    ['Mínimo', stat.min],
    ['Média', stat.mean],
    ['Máximo', stat.max],
  ];
  drawBarChart(chart, dataPairs, '#00bcd4');
  chartNote.textContent = `Visualizando ${label}`;
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
  populateColumnOptions(summary);
  pythonChartStatus.textContent = 'Escolha as colunas X, Y e o tipo de gráfico para começar.';
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

function populateColumnOptions(summary) {
  if (!chartColumnXSelect || !chartColumnYSelect) return;
  chartColumnXSelect.innerHTML = '';
  chartColumnYSelect.innerHTML = '';

  const columns = summary.headers.map((col) => ({
    value: col,
    type: summary.numeric.includes(col) ? 'numeric' : summary.textual.includes(col) ? 'textual' : 'unknown',
  }));

  const numericColumns = columns.filter((col) => col.type === 'numeric');

  if (!columns.length) {
    pythonChartStatus.textContent = 'Nenhuma coluna disponível para gerar gráficos.';
    return;
  }

  columns.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.dataset.type = opt.type;
    option.textContent = `${opt.value} (${opt.type === 'numeric' ? 'numérica' : 'texto'})`;
    chartColumnXSelect.appendChild(option);
  });

  numericColumns.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.dataset.type = opt.type;
    option.textContent = `${opt.value} (numérica)`;
    chartColumnYSelect.appendChild(option);
  });

  if (!numericColumns.length) {
    pythonChartStatus.textContent = 'Nenhuma coluna numérica disponível para o eixo Y.';
    return;
  }
}

async function ensurePyodide() {
  if (!pyodideReady) {
    pyodideReady = loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/' }).then(
      async (pyodideInstance) => {
        await pyodideInstance.loadPackage(['matplotlib', 'numpy']);
        return pyodideInstance;
      }
    );
  }
  return pyodideReady;
}

async function renderPythonChart(chartType, labels, values, title) {
  const pyodide = await ensurePyodide();
  pyodide.globals.set('labels', labels);
  pyodide.globals.set('values', values);
  pyodide.globals.set('chart_type', chartType);
  pyodide.globals.set('title_text', title);

  const code = `
import matplotlib.pyplot as plt
import io
import base64

plt.rcParams.update({'figure.figsize': (6, 3.5), 'axes.facecolor': '#f8fafc'})
fig, ax = plt.subplots()

if chart_type == 'linha':
    ax.plot(range(1, len(values) + 1), values, marker='o', color='#1d4ed8')
    ax.set_xlabel('Índice')
    ax.set_ylabel('Valor')
elif chart_type == 'colunas':
    ax.bar(range(len(values)), values, color='#22c55e')
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha='right')
    ax.set_ylabel('Valor')
else:
    colors = ['#00bcd4', '#1d4ed8', '#22c55e', '#0ea5e9', '#38bdf8', '#2563eb', '#67e8f9']
    ax.pie(values, labels=labels, autopct='%1.1f%%', colors=colors[: len(values)])

ax.set_title(title_text)
fig.tight_layout()
buf = io.BytesIO()
fig.savefig(buf, format='png', bbox_inches='tight', transparent=True)
buf.seek(0)
encoded = base64.b64encode(buf.read()).decode('utf-8')
buf.close()
plt.close(fig)
encoded
`;

  const encoded = await pyodide.runPythonAsync(code);
  return `data:image/png;base64,${encoded}`;
}

function buildXYSeries(columnX, columnY, chartType) {
  const pairs = dataset.records
    .map((row) => ({ label: row[columnX], value: Number(row[columnY]) }))
    .filter((item) => item.label !== undefined && item.label !== null && !Number.isNaN(item.value));

  if (!pairs.length) return { labels: [], values: [] };

  if (chartType === 'pizza') {
    const totals = new Map();
    pairs.forEach(({ label, value }) => {
      const key = String(label) || 'Sem valor';
      totals.set(key, (totals.get(key) || 0) + value);
    });
    const entries = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    return { labels: entries.map(([label]) => label), values: entries.map(([, value]) => value) };
  }

  const limitedPairs = pairs.slice(0, 200);
  return {
    labels: limitedPairs.map(({ label }) => String(label) || 'Sem valor'),
    values: limitedPairs.map(({ value }) => value),
  };
}

async function handlePythonChart() {
  if (!dataset) {
    pythonChartStatus.textContent = 'Carregue um conjunto de dados primeiro.';
    return;
  }

  const selectedX = chartColumnXSelect.options[chartColumnXSelect.selectedIndex];
  const selectedY = chartColumnYSelect.options[chartColumnYSelect.selectedIndex];
  const chartType = chartTypeSelect.value;
  if (!selectedX || !selectedY) {
    pythonChartStatus.textContent = 'Selecione colunas X e Y para gerar o gráfico.';
    return;
  }

  const columnX = selectedX.value;
  const columnY = selectedY.value;
  const columnTypeY = selectedY.dataset.type;

  if (chartType === 'pizza' && columnTypeY !== 'numeric') {
    pythonChartStatus.textContent = 'Escolha uma coluna numérica para Y em gráficos de pizza.';
    return;
  }

  if ((chartType === 'linha' || chartType === 'colunas') && columnTypeY !== 'numeric') {
    pythonChartStatus.textContent = 'Escolha uma coluna numérica para Y em gráficos de linha ou colunas.';
    return;
  }

  pythonChartStatus.textContent = 'Gerando gráfico em Python...';
  pythonChartImage.style.display = 'none';

  try {
    const series = buildXYSeries(columnX, columnY, chartType);
    if (!series.values.length) {
      pythonChartStatus.textContent = 'Não há dados suficientes para o gráfico escolhido.';
      return;
    }
    const src = await renderPythonChart(
      chartType,
      series.labels,
      series.values,
      `${columnY} por ${columnX} (${chartType})`
    );
    pythonChartImage.src = src;
    pythonChartImage.style.display = 'block';
    pythonChartStatus.textContent = 'Gráfico gerado com sucesso.';
  } catch (err) {
    console.error(err);
    pythonChartStatus.textContent = 'Não foi possível gerar o gráfico em Python.';
  }
}

fileInput.addEventListener('change', handleFileLoad);
sampleBtn.addEventListener('click', handleSample);
pythonChartBtn.addEventListener('click', handlePythonChart);

init();
