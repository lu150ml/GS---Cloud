const fileInput = document.getElementById('file-input');
const sampleBtn = document.getElementById('sample-btn');
const statsEl = document.getElementById('stats');
const numericStatsEl = document.getElementById('numeric-stats');
const categoryStatsEl = document.getElementById('category-stats');
const metaEl = document.getElementById('meta');
const chart = document.getElementById('chart');
const chartNote = document.getElementById('chart-note');
const chartColumnSelect = document.getElementById('chart-column');
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
  pythonChartStatus.textContent = 'Escolha a coluna e o tipo de gráfico para começar.';
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
  if (!chartColumnSelect) return;
  chartColumnSelect.innerHTML = '';
  const options = [
    ...summary.numeric.map((col) => ({ value: col, type: 'numeric' })),
    ...summary.textual.map((col) => ({ value: col, type: 'textual' })),
  ];

  if (!options.length) {
    pythonChartStatus.textContent = 'Nenhuma coluna disponível para gerar gráficos.';
    return;
  }

  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.dataset.type = opt.type;
    option.textContent = `${opt.value} (${opt.type === 'numeric' ? 'numérica' : 'texto'})`;
    chartColumnSelect.appendChild(option);
  });
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

function buildNumericSeries(column) {
  const values = dataset.records
    .map((row) => Number(row[column]))
    .filter((v) => !Number.isNaN(v));
  const limitedValues = values.slice(0, 200);
  const labels = limitedValues.map((_, idx) => `#${idx + 1}`);
  return { labels, values: limitedValues };
}

function buildPieSeries(column) {
  const counts = {};
  dataset.records.forEach((row) => {
    const value = row[column] || 'Desconhecido';
    counts[value] = (counts[value] || 0) + 1;
  });
  const pairs = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  return {
    labels: pairs.map(([label]) => label),
    values: pairs.map(([, count]) => count),
  };
}

async function handlePythonChart() {
  if (!dataset) {
    pythonChartStatus.textContent = 'Carregue um conjunto de dados primeiro.';
    return;
  }

  const selectedOption = chartColumnSelect.options[chartColumnSelect.selectedIndex];
  const chartType = chartTypeSelect.value;
  if (!selectedOption) {
    pythonChartStatus.textContent = 'Selecione uma coluna para gerar o gráfico.';
    return;
  }

  const column = selectedOption.value;
  const columnType = selectedOption.dataset.type;

  if (chartType === 'pizza' && columnType !== 'textual') {
    pythonChartStatus.textContent = 'Escolha uma coluna de texto para gráficos de pizza.';
    return;
  }

  if ((chartType === 'linha' || chartType === 'colunas') && columnType !== 'numeric') {
    pythonChartStatus.textContent = 'Escolha uma coluna numérica para gráficos de linha ou colunas.';
    return;
  }

  pythonChartStatus.textContent = 'Gerando gráfico em Python...';
  pythonChartImage.style.display = 'none';

  try {
    const series = chartType === 'pizza' ? buildPieSeries(column) : buildNumericSeries(column);
    if (!series.values.length) {
      pythonChartStatus.textContent = 'Não há dados suficientes para o gráfico escolhido.';
      return;
    }
    const src = await renderPythonChart(chartType, series.labels, series.values, `${column} (${chartType})`);
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
