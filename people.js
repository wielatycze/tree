'use strict';

const PAGE_SIZE = 200;
const DATA_FILES = ['si', 'births', 'marriages', 'deaths', 'places', 'nums'];

let allRows = [];
let visibleRows = [];
let renderedCount = 0;
let sortKey = 'surname';
let sortDirection = 'asc';
let filterTimer = null;

const tableWrap = document.getElementById('people-table-wrap');
const tableBody = document.getElementById('people-body');
const loading = document.getElementById('people-loading');
const count = document.getElementById('people-count');
const clearFilters = document.getElementById('clear-filters');
const filterInputs = Array.from(document.querySelectorAll('[data-filter]'));
const sortButtons = Array.from(document.querySelectorAll('[data-sort]'));

function dateRangeInputs(key) {
  return {
    from: document.querySelector(`[data-filter="${key}From"]`),
    to: document.querySelector(`[data-filter="${key}To"]`),
    output: document.querySelector(`[data-range-output="${key}"]`),
  };
}

function updateDateRange(key, changedInput = null) {
  const { from, to, output } = dateRangeInputs(key);
  if (changedInput === from && Number(from.value) > Number(to.value)) to.value = from.value;
  if (changedInput === to && Number(to.value) < Number(from.value)) from.value = to.value;
  output.textContent = `${from.value}–${to.value}`;
}

function setupDateRanges() {
  ['birth', 'marriage', 'death'].forEach(key => {
    const years = key === 'marriage'
      ? allRows.flatMap(row => row.marriageYears)
      : allRows
        .map(row => row[`${key}Sort`])
        .filter(value => value != null)
        .map(value => Math.floor(value / 10000));
    const min = Math.min(...years);
    const max = Math.max(...years);
    const { from, to } = dateRangeInputs(key);
    [from, to].forEach(input => {
      input.min = min;
      input.max = max;
      input.disabled = false;
    });
    from.value = min;
    to.value = max;
    from.dataset.defaultValue = min;
    to.dataset.defaultValue = max;
    updateDateRange(key);
  });
}

function createCell(text, className = '') {
  const cell = document.createElement('td');
  cell.textContent = text;
  if (className) cell.className = className;
  if (text) cell.title = text;
  return cell;
}

function appendNextPage() {
  if (renderedCount >= visibleRows.length) {
    loading.style.display = 'none';
    return;
  }

  const fragment = document.createDocumentFragment();
  const nextRows = visibleRows.slice(renderedCount, renderedCount + PAGE_SIZE);
  nextRows.forEach(person => {
    const row = document.createElement('tr');
    row.appendChild(createCell(person.surname));
    row.appendChild(createCell(person.given));
    row.appendChild(createCell(person.patronymic));
    row.appendChild(createCell(person.birth, 'date-cell'));
    row.appendChild(createCell(person.marriage, 'date-cell'));
    row.appendChild(createCell(person.death, 'date-cell'));
    row.appendChild(createCell(person.place));

    const idCell = createCell('', 'id-cell');
    const link = document.createElement('a');
    link.className = 'person-id-link';
    link.href = `index.html#${person.urlId}`;
    link.textContent = person.displayId;
    link.title = 'Паказаць дрэва';
    idCell.appendChild(link);
    row.appendChild(idCell);
    fragment.appendChild(row);
  });
  tableBody.appendChild(fragment);
  renderedCount += nextRows.length;
  loading.style.display = 'none';
}

function currentFilters() {
  return Object.fromEntries(filterInputs.map(input => {
    const isFullRangeEdge = input.type === 'range' && input.value === input.dataset.defaultValue;
    return [input.dataset.filter, isFullRangeEdge ? '' : input.value];
  }));
}

function updateSortIndicators() {
  sortButtons.forEach(button => {
    const active = button.dataset.sort === sortKey;
    if (active) {
      button.dataset.direction = sortDirection;
      button.closest('th').setAttribute('aria-sort', sortDirection === 'asc' ? 'ascending' : 'descending');
    } else {
      delete button.dataset.direction;
      button.closest('th').removeAttribute('aria-sort');
    }
  });
}

function applyView() {
  const filters = currentFilters();
  const filteredRows = PeopleList.filterRows(allRows, filters);
  visibleRows = PeopleList.sortRows(filteredRows, sortKey, sortDirection);
  renderedCount = 0;
  tableBody.innerHTML = '';
  tableWrap.scrollTop = 0;
  count.textContent = `Асоб: ${visibleRows.length.toLocaleString('be-BY')}`;
  clearFilters.disabled = !Object.values(filters).some(value => value.trim());

  if (!visibleRows.length) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.textContent = 'Нічога не знойдзена';
    row.appendChild(cell);
    tableBody.appendChild(row);
    loading.style.display = 'none';
    return;
  }
  appendNextPage();
}

async function loadPeople() {
  try {
    const responses = await Promise.all(DATA_FILES.map(name => fetch(`data/${name}.json`)));
    const failedResponse = responses.find(response => !response.ok);
    if (failedResponse) throw new Error(`HTTP ${failedResponse.status}`);
    const [searchIndex, births, marriages, deaths, places, numbers] = await Promise.all(
      responses.map(response => response.json())
    );
    allRows = PeopleList.createRows(searchIndex, births, deaths, places, numbers, marriages);
    setupDateRanges();
    updateSortIndicators();
    applyView();
  } catch (error) {
    loading.textContent = 'Не ўдалося загрузіць спіс асоб';
    loading.style.display = 'block';
  }
}

filterInputs.forEach(input => {
  input.addEventListener('input', () => {
    if (input.type === 'range') updateDateRange(input.dataset.filter.replace(/(From|To)$/, ''), input);
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyView, 160);
  });
});

sortButtons.forEach(button => {
  button.addEventListener('click', () => {
    const nextKey = button.dataset.sort;
    if (sortKey === nextKey) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    else {
      sortKey = nextKey;
      sortDirection = 'asc';
    }
    updateSortIndicators();
    applyView();
  });
});

clearFilters.addEventListener('click', () => {
  filterInputs.forEach(input => {
    input.value = input.type === 'range' ? input.dataset.defaultValue : '';
  });
  ['birth', 'marriage', 'death'].forEach(key => updateDateRange(key));
  applyView();
});

tableWrap.addEventListener('scroll', () => {
  const nearBottom = tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - 240;
  if (nearBottom) appendNextPage();
});

loadPeople();
