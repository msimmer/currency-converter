# Rates

A multi-currency converter and charting app in the style of the classic XE app.
It's a Progressive Web App (PWA) built with React, TypeScript and Vite. Install it on an
iPhone from Safari and it runs full-screen like a native app, and keeps working offline.

**Demo:** [msimmer.github.io/currency-converter](https://msimmer.github.io/currency-converter/)

## Features

- **Converter**: the top "You convert" card plus any number of currencies, including gold,
  silver, platinum and palladium (per troy oz). Tap any amount to edit it; every other row updates.
- **Calculator keypad**: + − × ÷ right in the amount, e.g. `2836.97 + 1000 × 1.05`.
  The result updates live, `=` collapses the sum, and Done closes the keypad. Keys respond on
  touch-down with a click sound (silent when the phone is on silent).
- **Currency menu** (tap a currency's code): change currency, chart it, make it the
  "You convert" currency, or remove it.
- **Send money** (in a currency's menu): sends from the "You convert" currency to that one
  through a destination you set up in **Settings**:
  - **Link**: any web page or app link (`yourbank://…`)
  - **Shortcut**: runs an iOS Shortcut by name, which can open any app
  - **Email**: opens Mail with a filled-in message

  Templates accept `{amount}` `{from}` `{receive}` `{to}` `{rate}` `{date}`. Destinations are
  stored only on the device, never in this repo; **Copy setup code** / **Restore** back them up.
- **Edit** (pencil): add currencies with +, remove them, or drag the ☰ handles to reorder them.
- **Charts**: any pair, ranges from 1W to 10Y, drag across the chart to read values, and
  open/close/high/low/average/spread.
- **Rate alerts** (Settings): a notification when a currency in your list hits a 2-week high
  or low against your "You convert" currency. Tapping it opens the chart. Needs the small
  Cloudflare Worker in `worker/` (setup in [worker/README.md](worker/README.md)).
- Reopens on the screen you last used. Light and dark mode, safe-area aware, offline cache.

## Data sources (free, no API key)

| What | Source | Notes |
|---|---|---|
| Latest rates, metals | [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api) | Updated daily |
| History, ECB currencies | [Frankfurter](https://frankfurter.dev) | ~30 major currencies, back to 1999 |
| History, everything else | fawazahmed0 dated snapshots | Back to March 2024, sampled |

## Run locally

You need Node.js 22.18 or newer. From the repo root:

```sh
npm install
npm run dev       # http://localhost:8642, with hot reload
```

The service worker (offline cache, alert notifications) only exists in production builds;
`npm run build && npm run preview` serves one at the same address.

| Command (from the root) | What it does |
|---|---|
| `npm run dev` / `npm run dev:worker` | Run the app / the alerts Worker locally |
| `npm test` | Run the tests for both |
| `npm run typecheck` | Typecheck both |
| `npm run build` | Build both (`app/dist`, `worker/dist`) |
| `npm run deploy` | Deploy the Worker, then the app (or `deploy:worker` / `deploy:app`) |

## Hosting

Pushing app changes to `main` deploys them: the **Deploy app** GitHub Action typechecks,
tests, builds and publishes `app/dist` to the `gh-pages` branch. `npm run deploy:app` does the
same from your machine. In the repo's **Settings → Pages**, the source must be
**Deploy from a branch → `gh-pages` / (root)**. The Worker deploys separately
(`npm run deploy:worker`).
The build uses relative URLs, so any static host works, but the service worker needs HTTPS.

## Install on iPhone

1. Open the URL in **Safari**.
2. Tap Share → **Add to Home Screen**.

## Layout

```
app/                  the PWA (Vite + React + TypeScript)
  index.html          page shell; React renders into #root
  src/App.tsx         state, tabs, rates refresh, keypad, row menus, Send money
  src/components/     converter list, keypad, chart, picker sheet, settings, action sheet
  src/lib/            plain TS: state changes, rates, formatting, calculator, send, alerts
  src/sw.ts           offline cache, shows alert notifications (built as sw.js)
  src/app.css         iOS-style styling, light/dark tokens
  public/             manifest, icons, icons/flags/ (HatScripts/circle-flags, MIT)
  test/               unit tests (Vitest)
worker/               Cloudflare Worker that checks rates and sends the alerts
```

Each deploy gets a new service worker automatically: the build gives the cache a version
derived from the app's files.
