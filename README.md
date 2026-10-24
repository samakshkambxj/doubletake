<div align="center">

# doubletake

**Catch unintended UI changes.**

Visual regression testing where the baselines live in your repo, not someone else's cloud.

[![ci](https://github.com/samakshkambxj/doubletake/actions/workflows/ci.yml/badge.svg)](https://github.com/samakshkambxj/doubletake/actions/workflows/ci.yml)

</div>

```bash
npx doubletake init     # write doubletake.config.json
npx doubletake update   # screenshot your app, accept them as baselines
npx doubletake check    # fail if the UI changed
```

That's it. No account, no API key, no upload. Screenshots run in a headless browser on your machine or in your CI runner.

## Why another one?

Because the expensive part of visual testing isn't the diff, it's the review.

Hosted tools keep baselines on their servers, so a UI change is something you go look at somewhere else. `doubletake` writes baselines as PNG files into `.doubletake/baselines/` and you commit them. A PR that changes the UI shows an image diff **inside the pull request**, next to the code that caused it. Reviewers already know how to review a diff — this just adds pictures.

It also means:

- **No account, no quota, no upload.** Your unreleased UI never leaves your runner.
- **Historical baselines for free.** `git log .doubletake/baselines/` is an audit trail of every accepted UI change.
- **Works offline**, in Docker, on a laptop, in a locked-down CI box.
- **Review artifacts are static files.** The report is one HTML file with relative image links — attach it to a build, open it with `file://`, no server required.

## What you see

```
$ doubletake check
doubletake 12 pages × 2 viewports

  ✗ home       desktop   1.04% changed
  ✓ pricing    desktop   unchanged
  ✗ home       mobile    8.25% changed  455×844 → 455×873
  + about      desktop   no baseline yet

2 changed · 1 unchanged · 1 new
review: .doubletake/runs/2026-10-24T05-10-43-957Z/report.html
accept: doubletake update
```

The report shows every page with a **side-by-side** view, an **onion skin** slider, and the raw **diff** where changed pixels are painted red and size changes are marked in magenta.

Exit code is `1` when anything changed, so it drops straight into CI.

## Install

```bash
npm i -D doubletake
npx playwright install chromium
```

Requires Node 18+. The browser download is Playwright's, and it's the only heavyweight dependency.

## Config

`doubletake init` writes this, then edit it:

```json
{
  "baseUrl": "http://localhost:3000",
  "pages": [
    { "name": "home", "path": "/" },
    { "name": "pricing", "path": "/pricing" }
  ],
  "viewports": [
    { "name": "desktop", "width": 1280, "height": 800 },
    { "name": "mobile", "width": 390, "height": 844 }
  ],
  "fullPage": true,
  "waitFor": 250,
  "maxDiffRatio": 0.002,
  "failOnSizeChange": true
}
```

| Key | Default | What it does |
| --- | --- | --- |
| `baseUrl` | `http://localhost:3000` | Origin that `path` values resolve against |
| `pages` | `[{ "name": "home", "path": "/" }]` | Shorthand: a bare string `"/pricing"` works too |
| `viewports` | `[{ "name": "desktop", "width": 1280, "height": 800 }]` | Shorthand: `[390, 844]` works too |
| `fullPage` | `true` | Full-page shot vs. viewport-only |
| `selector` | `null` | Screenshot one element instead of the page |
| `waitFor` | `250` | Extra ms after `networkidle`, for late paints |
| `timeout` | `30000` | Per-navigation timeout in ms |
| `threshold` | `0.1` | Pixelmatch colour tolerance (0–1) |
| `maxDiffRatio` | `0.002` | Fraction of pixels allowed to differ before failing |
| `failOnSizeChange` | `true` | Fail when a screenshot's dimensions change |
| `deviceScaleFactor` | `1` | Keep at 1 for reproducible diffs across machines |

Screenshots are taken with animations disabled and the text caret hidden, so blinking cursors don't fail your build.

## In CI

```yaml
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npx doubletake check
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: doubletake-report
    path: .doubletake/runs/
```

Start your app before `check`. To accept a deliberate redesign, run `npx doubletake update` locally and commit the new baselines — the changed PNGs are the reviewable part of the PR.

### What to commit

Commit `.doubletake/baselines/`. Ignore run artifacts — `doubletake` writes its own `.doubletake/.gitignore` so you don't have to touch your root one.

## Commands

| Command | Does |
| --- | --- |
| `doubletake check` | Screenshot, compare, write report. Exits `1` on change |
| `doubletake update` | Same, then accept current shots as the new baselines |
| `doubletake init` | Create `doubletake.config.json` |
| `doubletake report` | Print the path to the latest report |

Options: `-c, --config <path>`, `--no-color`, `-h, --help`, `-v, --version`.

## Roadmap

Honest about what v0.1 does not do yet:

- **Text shifts are noisy.** A paragraph that reflows lights up entirely, even where glyphs didn't change. Pixel diffing can't tell "moved" from "changed" — the fix is region clustering and a blur pass, not a bigger threshold.
- **Single browser.** Chromium only. Firefox and WebKit are behind a config flag.
- **No masks or ignore regions** for clocks, ads, and animations that are expected to differ.
- **No per-page overrides** of threshold or viewport.
- **No sharding** for very large suites.

Issues and PRs on any of these are welcome.

## License

MIT
