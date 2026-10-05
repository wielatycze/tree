import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const TRANSLATION_DIR = path.join(ROOT, 'translations', 'be');
const SPECS = [
  { file: 'given.json', values: rows => rows.map(row => row[2]) },
  { file: 'patronymics.json', values: rows => rows.map(row => row[3]) },
  { file: 'family-names.json', values: rows => rows.flatMap(row => [row[4], row[5]]) },
  { file: 'places.json', values: (rows, places) => Object.values(places) },
];

function sortedUnique(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()))]
    .sort((first, second) => first < second ? -1 : first > second ? 1 : 0);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readExisting(file) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function sourceData() {
  const [rows, places] = await Promise.all([
    readJson(path.join(ROOT, 'data', 'si.json')),
    readJson(path.join(ROOT, 'data', 'places.json')),
  ]);
  return { rows, places };
}

async function extract() {
  const { rows, places } = await sourceData();
  await fs.mkdir(TRANSLATION_DIR, { recursive: true });

  for (const spec of SPECS) {
    const file = path.join(TRANSLATION_DIR, spec.file);
    const existing = await readExisting(file);
    const keys = sortedUnique([...Object.keys(existing), ...spec.values(rows, places)]);
    const output = Object.fromEntries(keys.map(key => [key, existing[key] ?? null]));
    await fs.writeFile(file, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`${spec.file}: ${keys.length} values`);
  }
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

async function validate() {
  const { rows, places } = await sourceData();
  const errors = [];

  for (const spec of SPECS) {
    const file = path.join(TRANSLATION_DIR, spec.file);
    let dictionary;
    try {
      dictionary = await readJson(file);
    } catch (error) {
      errors.push(`${spec.file}: ${error.message}`);
      continue;
    }
    if (!isPlainObject(dictionary)) {
      errors.push(`${spec.file}: root must be a JSON object`);
      continue;
    }
    for (const [key, value] of Object.entries(dictionary)) {
      if (!key.trim()) errors.push(`${spec.file}: keys must not be empty`);
      if (typeof value !== 'string' || !value.trim()) {
        errors.push(`${spec.file}: untranslated value ${JSON.stringify(key)}`);
      }
    }
    for (const value of sortedUnique(spec.values(rows, places))) {
      if (!Object.hasOwn(dictionary, value)) {
        errors.push(`${spec.file}: missing source value ${JSON.stringify(value)}`);
      }
    }
  }

  if (errors.length) {
    errors.forEach(error => console.error(error));
    process.exitCode = 1;
    return;
  }
  console.log('Reviewed dictionaries cover every source value with non-empty translations.');
}

async function report() {
  const { rows, places } = await sourceData();
  for (const spec of SPECS) {
    const dictionary = await readJson(path.join(TRANSLATION_DIR, spec.file));
    const values = spec.values(rows, places).filter(Boolean);
    const unique = sortedUnique(values);
    const translated = value => typeof dictionary[value] === 'string' && dictionary[value].trim();
    const translatedUnique = unique.filter(translated).length;
    const translatedUses = values.filter(translated).length;
    const uniquePercent = unique.length ? Math.round(translatedUnique / unique.length * 100) : 100;
    const usagePercent = values.length ? Math.round(translatedUses / values.length * 100) : 100;
    console.log(`${spec.file}: ${translatedUnique}/${unique.length} values (${uniquePercent}%), ` +
      `${translatedUses}/${values.length} uses (${usagePercent}%)`);
  }
}

async function reportStale() {
  const { rows, places } = await sourceData();
  let staleCount = 0;

  for (const spec of SPECS) {
    const dictionary = await readJson(path.join(TRANSLATION_DIR, spec.file));
    const sourceValues = new Set(spec.values(rows, places).filter(Boolean));
    const staleEntries = Object.entries(dictionary)
      .filter(([sourceValue]) => !sourceValues.has(sourceValue))
      .sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0);

    if (!staleEntries.length) continue;
    staleCount += staleEntries.length;
    console.log(`\n${spec.file} (${staleEntries.length} stale):`);
    staleEntries.forEach(([sourceValue, translation]) => {
      console.log(`  ${sourceValue} => ${translation}`);
    });
  }

  if (staleCount === 0) console.log('No stale translation entries.');
  else console.log(`\nTotal stale entries: ${staleCount}`);
}

const command = process.argv[2];
if (command === 'extract') await extract();
else if (command === 'validate') await validate();
else if (command === 'report') await report();
else if (command === 'stale') await reportStale();
else {
  console.error('Usage: node scripts/translations.mjs <extract|validate|report|stale>');
  process.exitCode = 1;
}
