const assert = require('assert');
const PeopleList = require('../people-list');

describe('People list', function() {
  const searchIndex = [
    [12, 2, 'Мария', 'Павлова', 'Шабан', 'Шишпаренок', 1890],
    [7, 1, 'Петр', 'Саввин', 'Павловец', '', 1878],
    [25, 1, 'Адам', '', 'Грук', '', 0],
  ];
  const births = {
    7: [1878, 3, 4],
    12: [1890, 6, 0],
  };
  const deaths = {
    7: [1941, 0, 0],
    12: [1952, 11, 9],
  };
  const places = {
    7: 'Вяляцічы',
    12: 'Міётча',
  };
  const numbers = { 12: 494 };

  function rows() {
    return PeopleList.createRows(searchIndex, births, deaths, places, numbers);
  }

  it('builds display values and tree links without requiring a display id', function() {
    const [maria, petr] = rows();

    assert.strictEqual(maria.surname, 'Шабан (Шишпаренок)');
    assert.strictEqual(maria.birth, '??.06.1890');
    assert.strictEqual(maria.death, '09.11.1952');
    assert.strictEqual(maria.displayId, '#494');
    assert.strictEqual(maria.urlId, '494');
    assert.strictEqual(petr.displayId, '~7');
    assert.strictEqual(petr.urlId, '~7');
  });

  it('filters each field independently and combines active filters', function() {
    const people = rows();

    assert.deepStrictEqual(
      PeopleList.filterRows(people, { surname: 'шишпар', place: 'міёт' }).map(row => row.id),
      [12]
    );
    assert.deepStrictEqual(
      PeopleList.filterRows(people, { given: 'петр', patronymic: 'сав', birth: '1878' }).map(row => row.id),
      [7]
    );
    assert.deepStrictEqual(
      PeopleList.filterRows(people, { id: '#494' }).map(row => row.id),
      [12]
    );
    assert.deepStrictEqual(
      PeopleList.filterRows(people, { id: '~7' }).map(row => row.id),
      [7]
    );
  });

  it('sorts names alphabetically and keeps missing dates at the end', function() {
    const people = rows();

    assert.deepStrictEqual(
      PeopleList.sortRows(people, 'surname').map(row => row.id),
      [25, 7, 12]
    );
    assert.deepStrictEqual(
      PeopleList.sortRows(people, 'birth', 'asc').map(row => row.id),
      [7, 12, 25]
    );
    assert.deepStrictEqual(
      PeopleList.sortRows(people, 'birth', 'desc').map(row => row.id),
      [12, 7, 25]
    );
  });
});
