(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DataLocalization = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_LANGUAGE = 'be';
  const LANGUAGES = new Set(['ru', 'be']);

  function normalizeLanguage(language) {
    return LANGUAGES.has(language) ? language : DEFAULT_LANGUAGE;
  }

  function languageFromSearch(search) {
    const language = new URLSearchParams(search || '').get('lang');
    return normalizeLanguage(language);
  }

  function searchWithLanguage(search, language) {
    const params = new URLSearchParams(search || '');
    if (normalizeLanguage(language) === DEFAULT_LANGUAGE) params.delete('lang');
    else params.set('lang', language);
    const value = params.toString();
    return value ? `?${value}` : '';
  }

  function create(maps = {}) {
    const dictionaries = {
      given: maps.given || {},
      patronymics: maps.patronymics || {},
      familyNames: maps.familyNames || {},
      places: maps.places || {},
    };

    function translate(category, value, language) {
      if (!value || normalizeLanguage(language) === 'ru') return value;
      const translated = dictionaries[category][value];
      return typeof translated === 'string' && translated.trim() ? translated : value;
    }

    function localizeRecord(record, language) {
      if (!record || normalizeLanguage(language) === 'ru') return record;
      const localized = [...record];
      localized[2] = translate('given', record[2], language);
      localized[3] = translate('patronymics', record[3], language);
      localized[4] = translate('familyNames', record[4], language);
      localized[5] = translate('familyNames', record[5], language);
      return localized;
    }

    function localizePlace(place, language) {
      return translate('places', place, language);
    }

    function recordVariants(record) {
      const localized = localizeRecord(record, 'be');
      return localized === record || localized.every((value, index) => value === record[index])
        ? [record]
        : [record, localized];
    }

    function placeVariants(place) {
      const localized = localizePlace(place, 'be');
      return localized === place ? [place] : [place, localized];
    }

    return {
      localizePlace,
      localizeRecord,
      placeVariants,
      recordVariants,
      translate,
    };
  }

  return {
    DEFAULT_LANGUAGE,
    create,
    languageFromSearch,
    normalizeLanguage,
    searchWithLanguage,
  };
});
