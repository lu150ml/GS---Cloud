const DATA_STORAGE_KEY = 'data-explorer-latest';

function parseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  const lines = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (current || lines.length) {
        lines.push(current);
        rows.push(lines.slice());
        lines.length = 0;
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current || lines.length) {
    lines.push(current);
    rows.push(lines.slice());
  }

  const headers = rows.shift() || [];
  const records = rows.map((row) => {
    const obj = {};
    headers.forEach((key, index) => {
      obj[key] = row[index] ?? '';
    });
    return obj;
  });

  return { headers, records };
}

function detectColumnTypes(headers, records) {
  const numeric = new Set();
  const textual = new Set();

  headers.forEach((header) => {
    let numericCount = 0;
    records.forEach((row) => {
      const value = row[header];
      if (value === '' || Number.isNaN(Number(value))) return;
      numericCount++;
    });
    if (numericCount > 0 && numericCount >= records.length / 2) {
      numeric.add(header);
    } else {
      textual.add(header);
    }
  });

  return { numeric: [...numeric], textual: [...textual] };
}

function summarizeDataset(headers, records) {
  const { numeric, textual } = detectColumnTypes(headers, records);
  return {
    columns: headers.length,
    rows: records.length,
    numericColumns: numeric.length,
    textualColumns: textual.length,
    numeric,
    textual,
  };
}

function computeNumericStats(headers, records, numericColumns) {
  const stats = {};
  numericColumns.forEach((col) => {
    const values = records
      .map((row) => Number(row[col]))
      .filter((v) => !Number.isNaN(v));
    if (!values.length) return;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    stats[col] = { min, max, mean, count: values.length };
  });
  return stats;
}

function computeCategoryStats(headers, records, textualColumns) {
  const stats = {};
  textualColumns.forEach((col) => {
    const counts = {};
    records.forEach((row) => {
      const value = row[col] || 'Unknown';
      counts[value] = (counts[value] || 0) + 1;
    });
    const pairs = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    stats[col] = pairs.slice(0, 5);
  });
  return stats;
}

function saveDataset(name, headers, records) {
  const payload = { name, headers, records };
  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(payload));
}

function loadStoredDataset() {
  const raw = localStorage.getItem(DATA_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.headers && parsed.records) return parsed;
  } catch (err) {
    console.warn('Unable to load stored dataset', err);
  }
  return null;
}

async function loadSampleDataset() {
  const response = await fetch('data/sample-data.csv');
  const text = await response.text();
  const { headers, records } = parseCSV(text);
  return { name: 'Sample dataset', headers, records };
}

function formatNumber(num) {
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function populateStats(container, summary) {
  if (!container || !summary) return;
  container.innerHTML = '';
  const stats = [
    { label: 'Rows', value: summary.rows },
    { label: 'Columns', value: summary.columns },
    { label: 'Numeric columns', value: summary.numericColumns },
    { label: 'Text columns', value: summary.textualColumns },
  ];

  stats.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'stat';
    div.innerHTML = `<strong>${formatNumber(item.value)}</strong><span>${item.label}</span>`;
    container.appendChild(div);
  });
}

function updateMeta(metaEl, name, headers) {
  if (!metaEl) return;
  metaEl.style.display = 'block';
  metaEl.innerHTML = `<strong>Dataset:</strong> ${name} · <span class="badge">${headers.length} columns</span>`;
}

function bestNumericColumn(stats) {
  const entries = Object.entries(stats);
  if (!entries.length) return null;
  return entries.sort(([, a], [, b]) => b.mean - a.mean)[0];
}

function drawBarChart(canvas, dataPairs, color = '#1d4ed8') {
  if (!canvas || !dataPairs.length) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const padding = 50;
  const barWidth = (canvas.width - padding * 2) / dataPairs.length - 10;
  const maxVal = Math.max(...dataPairs.map(([, value]) => value)) || 1;

  ctx.fillStyle = '#0f172a';
  ctx.font = '14px "Segoe UI", sans-serif';

  dataPairs.forEach(([label, value], index) => {
    const x = padding + index * (barWidth + 10);
    const height = ((canvas.height - padding * 2) * value) / maxVal;
    const y = canvas.height - padding - height;

    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, height);

    ctx.fillStyle = '#0f172a';
    ctx.fillText(label, x, canvas.height - padding + 20);
    ctx.fillText(formatNumber(value), x, y - 8);
  });

  ctx.beginPath();
  ctx.moveTo(padding - 10, canvas.height - padding);
  ctx.lineTo(canvas.width - padding + 10, canvas.height - padding);
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();
}
