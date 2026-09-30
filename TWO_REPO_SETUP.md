# Private Source + Public GitHub Pages Setup

This guide describes a two-repository deployment for this project.

- Private source repository: `wielatycze/tree-source`
- Public deployment repository: `wielatycze/tree`
- Public site URL remains: `https://wielatycze.github.io/tree/`

Replace those names if different repositories are chosen.

## What This Does And Does Not Protect

The private repository can contain the readable source, tests, exporter, SQLite
database, build scripts, and development history. The public repository should
contain only files needed by the browser.

This does not make browser-side behavior secret. Visitors can still download and
inspect the deployed JavaScript and JSON. Bundling and minification make the
implementation less convenient to read; they are not a security boundary. Logic
that must actually remain secret must run on a backend rather than GitHub Pages.

The current public history has already exposed the source and
`data/tree.sqlite3`. Removing them from the latest commit does not erase old
commits, forks, clones, or caches. The split protects future source development
and keeps unnecessary files out of future deployments.

## Public Artifact Allowlist

The build should generate a `dist/` directory containing only:

- `index.html`
- `people.html`
- production CSS
- bundled or minified browser JavaScript, without source maps
- the JSON files under `data/` that the browser fetches
- `.nojekyll`
- an optional `CNAME` if a custom domain is configured

Never publish:

- `data/tree.sqlite3`
- `export.py`
- `test/`
- source maps (`*.map`)
- `.git/` or `.github/` from the private repository
- `node_modules/`
- development documentation or readable source modules when they are not needed
  by the deployed HTML
- credentials, tokens, `.env` files, or Actions secrets

The exported JSON is public because the browser downloads it. Sensitive data must
be removed during export or served by an authenticated backend.

## Instructions For The Repository Owner

### 1. Prepare And Back Up

1. Make sure the current working copy contains every change that must be retained.
2. Commit those changes before migration, or make a separate filesystem backup.
3. Do not delete or rewrite the existing public repository yet.
4. In GitHub, create `wielatycze/tree-source` as an empty **private** repository.
   Do not initialize it with a README, license, or `.gitignore`.

### 2. Push The Source To The Private Repository

From the existing local checkout:

```bash
git remote rename origin public
git remote add origin git@github.com:wielatycze/tree-source.git
git push -u origin main
git push origin --all
git push origin --tags
```

Afterward:

```bash
git remote -v
```

Expected meaning:

- `origin` points to the private source repository.
- `public` points to the public Pages repository.

Open `wielatycze/tree-source` in GitHub and verify that its visibility says
**Private** before continuing.

### 3. Let An Agent Prepare The Build

Give the agent the prompt in the "Instructions For A Future Agent" section below.
The agent should add and test the build in the private repository, but it must stop
before publishing or rewriting the public repository.

### 4. Create A Narrow Deployment Token

Create a fine-grained personal access token:

1. Open GitHub account settings.
2. Go to **Developer settings > Personal access tokens > Fine-grained tokens**.
3. Select the `wielatycze` resource owner.
4. Limit repository access to only `wielatycze/tree`.
5. Grant repository **Contents: Read and write**.
6. Set a reasonable expiration date.
7. Copy the token once.

If `wielatycze` is an organization, its policy may require approval for the token.

In the private `tree-source` repository:

1. Open **Settings > Secrets and variables > Actions**.
2. Create a repository secret named `PAGES_DEPLOY_TOKEN`.
3. Paste the fine-grained token as its value.

Never put the token in a file, commit, command example, issue, or chat message.

### 5. Configure The Public Repository

In `wielatycze/tree`:

1. Open **Settings > Pages**.
2. Select **Deploy from a branch**.
3. Select branch `main` and folder `/ (root)`.
4. Keep the repository public on GitHub Free.

The current public repository contains `.github/workflows/test.yml` and
`.github/workflows/export.yml`. Immediately before the first artifact deployment,
remove those workflows in a one-time commit authenticated as the repository owner.
The deliberately narrow deployment token has only Contents permission and should
not be expanded merely to edit workflow files. The test/export workflows belong
in the private source repository after the split.

If `main` has branch protection, configure it so the token owner can publish the
generated commit, or use a dedicated unprotected deployment branch as the Pages
source. Do not silently weaken protection on the private source repository.

The public repository should be treated as generated output. Do not edit its
files manually after the workflow owns it.

### 6. Make The First Deployment

1. In the private repository, open **Actions**.
2. Run the publish workflow manually.
3. Confirm that tests and the artifact-safety check pass.
4. Inspect the public repository before opening the site.
5. Verify that only deployment files are present and that the SQLite database,
   tests, exporter, source maps, and private workflow are absent.
6. Open both `index.html` and `people.html` through the Pages URL.
7. Test tree modes, search, comparison URLs, generation limits, relationship
   labels, and marriage dates.

### 7. Decide How To Handle Old Public History

Publishing a clean latest commit does not erase the old source history.

The least risky choice is to accept that old revisions were already public and
keep the existing repository, while publishing only artifacts going forward.

For a clean public Git history, use a new public repository and test it first.
Deleting/recreating `wielatycze/tree`, force-pushing an orphan history, or changing
the Pages repository can break links and is destructive. A future agent must not
perform any of those operations without explicit approval and a verified backup.

## Instructions For A Future Agent

Copy the following prompt into a future coding-agent session opened in the private
source repository:

```text
Set up this genealogy project for a two-repository deployment.

Repository roles:
- This checkout is the private source repository: wielatycze/tree-source.
- The generated public repository will be: wielatycze/tree.
- The existing Pages URL must remain https://wielatycze.github.io/tree/.

Safety rules:
- Do not push, force-push, delete, recreate, rename, or change visibility of any
  repository.
- Do not change git remotes.
- Do not request, print, read, or store a token in the workspace.
- Do not publish data/tree.sqlite3, tests, export.py, source maps, source-only
  documentation, package caches, or private workflows.
- Do not remove existing application behavior or alter public URLs.
- Preserve the current relative-path behavior required by a /tree/ project site.
- Stop after local implementation and verification. Report the exact manual
  GitHub steps still required from the owner.

Implementation requirements:
1. Audit every HTML, CSS, JavaScript, JSON, and generated-data dependency.
2. Add a deterministic `npm run build` that creates `dist/` from scratch.
3. Keep only browser-required HTML, production CSS, minified JavaScript, exported
   JSON, and `.nojekyll` in `dist/`.
4. Do not generate JavaScript or CSS source maps.
5. Prefer a conservative build that preserves the current script execution order
   and filenames unless a bundle is proven equivalent.
6. Add an automated artifact test that fails if `dist/` contains the SQLite
   database, test files, Python files, source maps, secrets, or unexpected files.
7. Run the existing test suite against source code.
8. Serve `dist/` locally and verify index.html and people.html, JSON loading, tree
   navigation, ancestors/descendants modes, comparison URLs, search, relationship
   labels, generation lines, and marriage dates.
9. Add `.github/workflows/publish.yml` using the workflow shape documented in
   TWO_REPO_SETUP.md. It may reference only the secret `PAGES_DEPLOY_TOKEN`.
10. Ensure pull-request workflows cannot publish and cannot access the deployment
    secret. Publishing may run only after a push to private `main` or a manual run.
11. Document build, preview, deployment, rollback, and token rotation commands.
12. Run `npm test`, `npm run build`, the artifact-safety test, and any browser smoke
    checks before reporting completion.

Do not perform the public cutover. Show me the resulting dist/ manifest and the
workflow diff, then wait for explicit approval.
```

## Workflow Shape For The Agent

The future agent should adapt and verify this template rather than pasting it
blindly. It assumes `npm run build` produces `dist/`.

```yaml
name: Publish public site

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: public-pages-publish
  cancel-in-progress: true

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Check out private source
        uses: actions/checkout@v6
        with:
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Test
        run: npm test

      - name: Build public artifact
        run: npm run build

      - name: Verify artifact boundary
        shell: bash
        run: |
          test -f dist/index.html
          test -f dist/people.html
          test ! -e dist/data/tree.sqlite3
          if find dist -type f \( -name '*.map' -o -name '*.py' -o -name '*.sqlite3' -o -name '.env*' \) -print -quit | grep -q .; then
            echo 'Forbidden file found in dist/' >&2
            exit 1
          fi

      - name: Check out public deployment repository
        uses: actions/checkout@v6
        with:
          repository: wielatycze/tree
          token: ${{ secrets.PAGES_DEPLOY_TOKEN }}
          path: published

      - name: Replace public files
        shell: bash
        run: |
          rsync -a --delete --exclude='.git/' dist/ published/
          touch published/.nojekyll

      - name: Commit and push deployment
        shell: bash
        run: |
          cd published
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add -A
          if git diff --cached --quiet; then
            echo 'No deployment changes.'
            exit 0
          fi
          git commit -m "Deploy ${GITHUB_SHA::7}"
          git push origin HEAD:main
```

The repository-scoped secret is encrypted by GitHub and is made available only
when explicitly referenced by the workflow. Keep the token limited to the one
public repository and rotate it when it expires or if exposure is suspected.

## Normal Operation After Migration

Development happens only in the private source repository:

```bash
git status
npm ci
npm test
npm run build
git add -A
git commit
git push origin main
```

The private workflow tests and builds, then replaces the public repository with
the contents of `dist/`. The public repository is not a development checkout.

To roll back, revert the source commit in the private repository and publish
again. Do not manually reconstruct an old public artifact unless the private
workflow is unavailable.

## Official GitHub References

- Pages publishing sources and Actions workflows:
  https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- GitHub Pages repository availability:
  https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- GitHub Actions secrets:
  https://docs.github.com/en/actions/concepts/security/secrets
- Fine-grained token permissions:
  https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens
