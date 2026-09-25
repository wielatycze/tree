(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PeopleList = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const collator = new Intl.Collator(['be', 'ru'], { sensitivity: 'base', numeric: true });

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function formatDate(date) {
    if (!date || !date[0]) return '';
    const [year, month, day] = date;
    if (!month) return String(year);
    const paddedMonth = String(month).padStart(2, '0');
    if (!day) return `??.${paddedMonth}.${year}`;
    return `${String(day).padStart(2, '0')}.${paddedMonth}.${year}`;
  }

  function dateSortValue(date) {
    if (!date || !date[0]) return null;
    return date[0] * 10000 + (date[1] || 0) * 100 + (date[2] || 0);
  }

  function surnameLabel(surname, maiden) {
    if (surname && maiden && surname !== maiden) return `${surname} (${maiden})`;
    return surname || maiden || '';
  }

  function createRows(searchIndex, births, deaths, places, numbers, marriages = {}) {
    return searchIndex.map(record => {
      const [id, , given, patronymic, surname, maiden] = record;
      const birthDate = births[id] || null;
      const deathDate = deaths[id] || null;
      const marriageDates = (marriages[id] || [])
        .map(marriage => marriage[1])
        .filter(date => date && date[0])
        .sort((first, second) => dateSortValue(first) - dateSortValue(second));
      const number = numbers[id];
      const displayId = number != null ? `#${number}` : `~${id}`;
      const row = {
        id,
        surname: surnameLabel(surname, maiden),
        given: given || '',
        patronymic: patronymic || '',
        birth: formatDate(birthDate),
        marriage: marriageDates.map(formatDate).join('; '),
        death: formatDate(deathDate),
        place: places[id] || '',
        displayId,
        urlId: number != null ? String(number) : `~${id}`,
        birthSort: dateSortValue(birthDate),
        marriageSort: marriageDates.length ? dateSortValue(marriageDates[0]) : null,
        marriageYears: marriageDates.map(date => date[0]),
        deathSort: dateSortValue(deathDate),
        idSort: number != null ? number : id,
      };
      row.search = {
        surname: normalize([surname, maiden, row.surname].filter(Boolean).join(' ')),
        given: normalize(row.given),
        patronymic: normalize(row.patronymic),
        birth: normalize(row.birth),
        death: normalize(row.death),
        place: normalize(row.place),
        id: normalize(`${row.displayId} ${id} ${number != null ? number : ''}`),
      };
      return row;
    });
  }

  function filterRows(rows, filters) {
    const activeFilters = Object.entries(filters)
      .filter(([key]) => !/^(birth|marriage|death)(From|To)$/.test(key))
      .map(([key, value]) => [key, normalize(value)])
      .filter(([, value]) => value);
    const ranges = ['birth', 'marriage', 'death'].map(key => ({
      key,
      from: Number.parseInt(filters[`${key}From`], 10),
      to: Number.parseInt(filters[`${key}To`], 10),
    })).filter(range => Number.isFinite(range.from) || Number.isFinite(range.to));

    if (!activeFilters.length && !ranges.length) return rows;
    return rows.filter(row =>
      activeFilters.every(([key, value]) => row.search[key].includes(value)) &&
      ranges.every(({ key, from, to }) => {
        const years = key === 'marriage'
          ? row.marriageYears
          : [row[`${key}Sort`]].filter(value => value != null).map(value => Math.floor(value / 10000));
        return years.some(year =>
          (!Number.isFinite(from) || year >= from) &&
          (!Number.isFinite(to) || year <= to)
        );
      })
    );
  }

  function compareOptional(first, second, direction) {
    const firstMissing = first == null || first === '';
    const secondMissing = second == null || second === '';
    if (firstMissing || secondMissing) {
      if (firstMissing && secondMissing) return 0;
      return firstMissing ? 1 : -1;
    }
    const comparison = typeof first === 'number'
      ? first - second
      : collator.compare(first, second);
    return direction === 'desc' ? -comparison : comparison;
  }

  function sortRows(rows, key, direction = 'asc') {
    const sortValue = row => {
      if (key === 'birth') return row.birthSort;
      if (key === 'marriage') return row.marriageSort;
      if (key === 'death') return row.deathSort;
      if (key === 'id') return row.idSort;
      return row[key];
    };
    return [...rows].sort((first, second) =>
      compareOptional(sortValue(first), sortValue(second), direction) ||
      collator.compare(first.surname, second.surname) ||
      collator.compare(first.given, second.given) ||
      collator.compare(first.patronymic, second.patronymic) ||
      compareOptional(first.birthSort, second.birthSort, 'asc') ||
      first.id - second.id
    );
  }

  return { createRows, filterRows, formatDate, sortRows, surnameLabel };
});
