const fileInput = document.getElementById('file-input');
const sampleBtn = document.getElementById('sample-btn');
const searchInput = document.getElementById('search');
const statsEl = document.getElementById('stats');
const table = document.getElementById('data-table');
const emptyMessage = document.getElementById('empty-message');
const metaEl = document.getElementById('meta');

let dataset = null;
let filteredRecords = [];

function renderTable(headers, records) {
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (!headers.length || !records.length) {
    emptyMessage.style.display = 'block';
    return;
  }

  emptyMessage.style.display = 'none';

  const headRow = document.createElement('tr');
  headers.forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  records.forEach((row) => {
    const tr = document.createElement('tr');
    headers.forEach((header) => {
      const td = document.createElement('td');
      td.textContent = row[header];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function updateSummary(name, headers, records) {
  const summary = summarizeDataset(headers, records);
  populateStats(statsEl, summary);
  updateMeta(metaEl, name, headers);
}

function filterRecords(term) {
  if (!dataset) return [];
  if (!term) return dataset.records;
  const lower = term.toLowerCase();
  return dataset.records.filter((row) =>
    Object.values(row).some((value) => String(value).toLowerCase().includes(lower))
  );
}

function showData(name, headers, records) {
  dataset = { name, headers, records };
  filteredRecords = records;
  renderTable(headers, records);
  updateSummary(name, headers, records);
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

function handleSearch(event) {
  const value = event.target.value;
  filteredRecords = filterRecords(value);
  renderTable(dataset.headers, filteredRecords);
}

function init() {
  const stored = loadStoredDataset();
  if (stored) {
    showData(stored.name, stored.headers, stored.records);
  }
}

fileInput.addEventListener('change', handleFileLoad);
sampleBtn.addEventListener('click', handleSample);
searchInput.addEventListener('input', handleSearch);

init();
