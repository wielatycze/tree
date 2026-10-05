const assert = require('assert');
const DataLocalization = require('../data-localization');

describe('Data localization', function() {
  const localizer = DataLocalization.create({
    given: { 'Иван': 'Іван', 'Петр': null },
    patronymics: { 'Иванов': 'Іванавіч' },
    familyNames: { 'Павлов': 'Паўлаў' },
    places: { 'Велятичи': 'Вяляцічы' },
  });

  it('uses exact Belarusian mappings without mutating canonical Russian records', function() {
    const source = [7, 1, 'Иван', 'Иванов', 'Павлов', '', 1880];
    const localized = localizer.localizeRecord(source, 'be');

    assert.deepStrictEqual(localized, [7, 1, 'Іван', 'Іванавіч', 'Паўлаў', '', 1880]);
    assert.deepStrictEqual(source, [7, 1, 'Иван', 'Иванов', 'Павлов', '', 1880]);
    assert.strictEqual(localizer.localizePlace('Велятичи', 'be'), 'Вяляцічы');
  });

  it('falls back to Russian for missing and unfinished mappings', function() {
    assert.strictEqual(localizer.translate('given', 'Петр', 'be'), 'Петр');
    assert.strictEqual(localizer.translate('given', 'Савва', 'be'), 'Савва');
    assert.strictEqual(localizer.translate('given', 'Иван', 'ru'), 'Иван');
  });

  it('keeps Belarusian mode-free and stores Russian explicitly in the URL', function() {
    assert.strictEqual(DataLocalization.languageFromSearch('?lang=be'), 'be');
    assert.strictEqual(DataLocalization.languageFromSearch('?lang=unknown'), 'be');
    assert.strictEqual(DataLocalization.searchWithLanguage('?mode=ancestors&lang=ru', 'be'), '?mode=ancestors');
    assert.strictEqual(DataLocalization.searchWithLanguage('?mode=ancestors', 'ru'), '?mode=ancestors&lang=ru');
  });
});
