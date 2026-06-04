# Troubleshooting — 2DKS

## Sync fails: "GITHUB_TOKEN is not set"

**Cause**: The `GITHUB_TOKEN` environment variable is missing from the Worker.

**Fix**:
```bash
# For local Worker dev:
export GITHUB_TOKEN=your_personal_access_token
npm run dev:worker

# For production: set via Cloudflare dashboard
# Workers & Pages → 2dks → Settings → Variables → Add Secret: GITHUB_TOKEN
```

The token needs `repo` scope (read + write to the repo, including the `data` branch).

---

## Sync fails: "GitHub API error (404)"

**Cause**: `GITHUB_OWNER`/`GITHUB_REPO` in `wrangler.jsonc` points to a non-existent repo, the `GITHUB_BRANCH` (`data`) does not exist yet, or the token lacks access.

**Fix**:
1. Verify the repo exists: `https://github.com/<GITHUB_OWNER>/<GITHUB_REPO>`
2. Verify the `data` branch exists with at least one commit (see [`data-branch-setup.md`](./data-branch-setup.md))
3. Verify the token has access to that repo
4. Check `wrangler.jsonc` for typos in `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`

---

## Cloudflare Access 403 / login loop

**Cause**: Cloudflare Access is blocking requests before they reach the Worker.

**Fix**:
1. Confirm your email is on the allowlist in Cloudflare Zero Trust → Access → Applications
2. Confirm the correct Worker hostname is protected (not a different subdomain)
3. Try opening a private browser window and re-authenticating with Access

---

## Graph loads blank (no nodes visible)

**Cause 1**: `public/graph/index.json` is missing or malformed on the `data` branch.

**Fix**: Check the `data` branch of `fakpuz/2dks` for `public/graph/index.json`. If missing, run the legacy migration script or create an empty graph structure.

**Cause 2**: Worker is not configured (running Vite only with `npm run dev` instead of `npm run dev:worker`).

**Fix**: Use `npm run dev:worker` for full Worker + sync functionality.

---

## Space not loading (nested space is empty)

**Cause**: The space file `public/graph/spaces/<spaceId>.json` is missing from the `data` branch.

**Fix**: The space file is created on first sync after adding nodes to a space. Use `S` to sync from the app, or manually create an empty space file on the `data` branch:
```json
{ "nodesById": {}, "linksById": {}, "fencesById": {}, "nodeIds": [], "linkIds": [], "fenceIds": [] }
```

---

## Wikilinks not resolving

**Cause**: The target node name doesn't match exactly (case-sensitive).

**Fix**: Check that `[[targetName]]` exactly matches the `name` field of the target node in the same space or a searchable space. The auto-create prompt appears when you click an unresolved wikilink.

---

## Embeds not rendering (`![[imageName]]`)

**Cause**: The embedded file doesn't exist in the graph or the path is incorrect.

**Fix**: Embeds reference nodes by name. Confirm the referenced node exists and has valid Markdown content with an image URL or inline content.

---

## Sync overwrites local changes

**Cause**: The sync flow fetches the latest from GitHub and merges. If the same node was edited both locally and in the remote, the last sync wins.

**Note**: 2DKS is designed for single-user use. Multi-device conflicts are handled by the "last sync wins" strategy. To avoid losing work, sync frequently (press `S` before switching devices).

---

## Migration from legacy data format

**Cause**: Old monolithic `graph.json` format doesn't work with the current multi-space format.

**Fix**: Run the migration script:
```bash
node scripts/migrate-legacy-data.mjs
```

See `docs/data-branch-setup.md` for complete migration instructions.
