# Вяляцічы і воласць

Static genealogy browser for the Veliatychi database. It is designed for GitHub Pages and has no production dependencies or application server.

## Pages

- `index.html` renders ancestor, descendant, and common-ancestor trees.
- `people.html` renders the searchable and sortable people directory in incremental DOM batches.

Both pages fetch generated JSON from `data/`. Person URLs use a public display ID when one exists and `~<database-id>` otherwise.

Examples:

```text
index.html#494
index.html#~16591
index.html?mode=ancestors#494
index.html?compare=~16591,~17605
people.html
```

Descendants mode is the default and is intentionally omitted from its canonical URL.

## Development

Requirements:

- Node.js 22.12 or newer for tests
- Python 3 for exporting SQLite data
- A static HTTP server for local browser testing; opening the HTML directly will not allow JSON requests in most browsers

Install and test:

```bash
npm ci
npm test
```

Serve the repository root with any static server, then open `index.html` or `people.html`. For example:

```bash
python -m http.server 8000
```

## Data Export

`data/tree.sqlite3` is the source database. Regenerate browser data with:

```bash
python export.py
```

The exporter accepts optional paths:

```bash
DB_PATH=/path/to/tree.sqlite3 OUT_DIR=/path/to/output python export.py
```

Generated files:

| File | Purpose |
| --- | --- |
| `si.json` | Compact person/search records |
| `parents.json` | Parents keyed by child |
| `children.json` | Children keyed by parent |
| `marriages.json` | Spouses, marriage dates, and couple children |
| `places.json` | Person places |
| `nums.json` | Public display IDs |
| `births.json` | Birth dates |
| `deaths.json` | Death dates |

Dates use compact arrays. Exact values are `[year, month, day]`; qualified values append a type (`1` approximate, `2` before, `3` after), and type `4` also appends the second `[year, month, day]` for a range.

The tree page loads its independent data files concurrently and builds in-memory indexes for person and public-ID lookups. The directory keeps all searchable records in memory but renders only 200 table rows at a time.

## Architecture

- `tree.js` coordinates data loading, URL state, interaction, and rendering.
- `descendant-layout.js` contains descendant contour packing and connector-lane logic.
- `common-ancestor-layout.js` builds and lays out minimal common-ancestor graphs.
- `tree-layout.js` contains small shared positioning rules.
- `people-list.js` contains pure row creation, filtering, and sorting logic.
- `people.js` owns directory-page DOM behavior and incremental rendering.

Layout modules and list transformations are kept independent of the DOM and tested directly. `test/descendant-render.integration.test.js` exercises the real generated data against the browser renderer using a lightweight DOM fixture.

## Deployment

GitHub Pages can publish the repository root directly. `.github/workflows/test.yml` runs the full suite on pushes and pull requests. `.github/workflows/export.yml` regenerates and commits JSON when the SQLite database or exporter changes.

The default person is configured as `CONFIG.homeId` near the top of `tree.js`.
