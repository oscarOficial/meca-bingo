# Releasing Meca Bingo Sync

Everything lives in this repo:

| What | Where |
|---|---|
| Extension source (one code base for every browser) | `extension/` |
| Music players it works with | `extension/players.json` |
| Sites it talks to | `site.config.json` |
| Build for Chrome / Firefox / Safari | `python3 tools/build_extension.py` → `dist/<browser>/` and `public/download/meca-bingo-sync-<browser>.zip` |
| Test with fake players | `python3 tools/ext/players_e2e.py` |
| Store texts and permission reasons | `extension/STORE.md` |
| CI and releases | `.github/workflows/extension.yml` |

## Release a new version (automatic)

GitHub → **Actions → Extension → Run workflow** → choose:

- `patch` (1.1.0 → 1.1.1) for fixes,
- `minor` (1.1.0 → 1.2.0) for new features or new players/domains,
- `major` for big changes.

The workflow tests the extension, raises the version, commits the new zips (the website's
download links update with the next deploy), tags `ext-vX.Y.Z`, creates a GitHub Release with
the three zips and, if the secrets below are set, uploads the version to Chrome, Firefox and Edge. The stores
still review it before users get it (hours to a few days).

Locally: `python3 tools/build_extension.py --bump minor` (or `--version 1.2.0`).

## Store secrets (GitHub → Settings → Secrets and variables → Actions)

Without them the release still happens; you upload the zips to the stores by hand.

**Chrome Web Store**
- `CWS_EXTENSION_ID`: the item id in the Chrome Web Store dashboard (`kjefpodcfpmpoocaeliddebomimbckic`).
- `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`: an OAuth client for the
  Chrome Web Store API. Steps:
  https://github.com/fregante/chrome-webstore-upload-keys

**Firefox Add-ons**
- `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`: https://addons.mozilla.org/developers/addon/api/key/

**Microsoft Edge Add-ons** (same package as Chrome; script: `tools/ext/edge_publish.py`)
- `EDGE_PRODUCT_ID`: the Product ID in Partner Center → Edge → the extension → Extension overview
  (`3c0b9cab-356c-4849-8f09-18d5f439349f`).
- `EDGE_CLIENT_ID`, `EDGE_API_KEY`: Partner Center → Edge → **Publish API** → Create API credentials.
  The API key expires (the page shows the date): create a new one and update the secret before then.

Before running a release, wait until the previous version has finished review in each store: Chrome
refuses an upload while a version is still pending.

**Safari** needs a Mac: `xcrun safari-web-extension-converter dist/safari`, then build and
upload from Xcode (Apple Developer Program, 99 USD/year). It cannot run in this workflow
without Apple signing certificates.

## Rules

- Never change the Firefox id in `tools/build_extension.py` (`GECKO_ID`).
- Each new site domain or music player means a new version and a new store review.
- The store refuses a version number it has already seen: always release through the workflow
  (or `--bump`) instead of reusing a number.
