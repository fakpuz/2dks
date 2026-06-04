# Data Branch Setup

2DKS stores graph truth on a dedicated branch of this same repository, rather than in a separate data repo. There is one repo (`fakpuz/2dks`) with two branches:

- `main` — application code (frontend + Worker).
- `data` — graph truth only: `public/graph/index.json` and `public/graph/spaces/*.json`.

The `data` branch is an **orphan branch**: it shares no history with `main` and contains only the graph JSON. This keeps the code history and the data history cleanly separated while living in a single repo. The Worker reads from and writes to this branch over the GitHub API; it never touches your local `main` checkout.

## Data branch shape

The `data` branch should contain only:

```text
public/graph/index.json
public/graph/spaces/root.json
public/graph/spaces/<spaceId>.json
```

## Steps

1. Create the orphan `data` branch in this repo (run from a clean checkout):

   ```bash
   git switch --orphan data
   git rm -rf . >/dev/null 2>&1 || true
   ```

   `--orphan` starts a branch with no parent commits, so none of the app code is carried over.

2. Seed the graph files on the branch and make the first commit so the ref exists.

   If you are **migrating from the old `2dks-data` repo**, copy its `public/graph/` tree in:

   ```bash
   mkdir -p public/graph/spaces
   cp /path/to/2dks-data/public/graph/index.json public/graph/
   cp /path/to/2dks-data/public/graph/spaces/*.json public/graph/spaces/
   ```

   If you are **starting fresh**, you can commit an empty marker; the Worker bootstraps an empty manifest on first load and an empty root space on first sync:

   ```bash
   mkdir -p public/graph/spaces
   echo "# 2DKS data branch" > public/graph/README.md
   ```

3. Commit and push the branch:

   ```bash
   git add -A
   git commit -m "Seed graph truth on data branch"
   git push -u origin data
   ```

4. Switch back to code:

   ```bash
   git switch main
   ```

5. Point the Worker at the branch in `wrangler.jsonc`:

   - `GITHUB_OWNER` — `fakpuz`
   - `GITHUB_REPO` — `2dks` (the same repo)
   - `GITHUB_BRANCH` — `data`

   And in Cloudflare set the `GITHUB_TOKEN` secret plus Cloudflare Access for site authentication.

6. Make sure `GITHUB_TOKEN` has write access to this repo (`repo` scope for a private repo).

7. Deploy the Worker again.

8. Test in a private window:
   - open the Worker URL
   - complete Cloudflare Access login
   - confirm the graph loads
   - edit a node
   - press `S`
   - verify a `Sync 2DKS graph at <timestamp>` commit lands on the `data` branch

## Important

The Worker reads `/graph/...` from the configured branch and writes sync commits to the same branch. After this setup:

- `main` stays focused on code; its history is never polluted by sync commits.
- the `data` branch is the source of truth — a self-describing archive of plain JSON.
- both live in one repo, so there is only one place to clone, fork, and grant access to.
