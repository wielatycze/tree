# Велятичи Family Tree

Interactive family tree visualizer for the Veliatychi genealogy database, hosted on GitHub Pages.

## Live site

`https://<your-username>.github.io/<repo-name>/`

---

## Setup (one-time)

### 1. Create the repo

```bash
git init veliatychi
cd veliatychi
# copy all files here
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### 2. Put your database in `data/`

```bash
cp /path/to/Велятичи_SQLite3.txt data/
```

### 3. Generate the JSON files locally (first time)

```bash
python3 export.py
```

This creates `data/si.json`, `data/parents.json`, etc.

### 4. Commit everything

```bash
git add data/
git commit -m "Add database and initial JSON export"
git push
```

### 5. Enable GitHub Pages

Go to your repo → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: `main`, folder: `/ (root)`.

Your site will be live at `https://<you>.github.io/<repo>/` within a minute.

---

## Updating the database

Just push the new `.txt` file:

```bash
cp /path/to/updated_Велятичи_SQLite3.txt data/Велятичи_SQLite3.txt
git add data/Велятичи_SQLite3.txt
git commit -m "Update database"
git push
```

The GitHub Action will automatically:
1. Run `export.py` to regenerate all JSON files
2. Commit the updated JSONs back to the repo
3. GitHub Pages re-deploys with fresh data

Total time from push to live update: **~2 minutes**.

---

## Changing the default person

In `index.html`, find this line near the top of the `<script>`:

```js
const HOME_ID = 11083;   // ← change to your preferred starting person id
```

---

## File structure

```
├── index.html              # the visualizer
├── export.py               # database → JSON exporter
├── data/
│   ├── Велятичи_SQLite3.txt  # your database (source of truth)
│   ├── si.json               # search index (auto-generated)
│   ├── parents.json          # parent relationships
│   ├── children.json         # children relationships
│   ├── marriages.json        # marriage events
│   ├── places.json           # place names per person
│   ├── nums.json             # # field values
│   ├── births.json           # birth dates
│   └── deaths.json           # death dates
└── .github/
    └── workflows/
        └── export.yml        # auto-export on push
```

## Notes

- The `.txt` database file is ~45MB — GitHub has a 100MB file size limit, so you're fine.
  If it ever exceeds 100MB, use [Git LFS](https://git-lfs.github.com/).
- The JSON files total ~3MB and are what the browser actually loads.
- Deep-linking works: each person gets a URL like `yoursite.github.io/veliatychi/#11083`.
