# Rates

A multi-currency converter and charting app in the style of the classic XE app.
It's a Progressive Web App (PWA): plain HTML/CSS/JS with no build step. Install it on an
iPhone from Safari and it runs full-screen like a native app, and keeps working offline.

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
- **Edit** (pencil): remove currencies or drag the ☰ handles to reorder them.
- **Charts**: any pair, ranges from 1W to 10Y, drag across the chart to read values, and
  open/close/high/low/average/spread.
- Reopens on the screen you last used. Light and dark mode, safe-area aware, offline cache.

## Data sources (free, no API key)

| What | Source | Notes |
|---|---|---|
| Latest rates, metals | [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api) | Updated daily |
| History, ECB currencies | [Frankfurter](https://frankfurter.dev) | ~30 major currencies, back to 1999 |
| History, everything else | fawazahmed0 dated snapshots | Back to March 2024, sampled |

## Run locally

```sh
python3 -m http.server 8642
# open http://localhost:8642
```

## Install on iPhone

The service worker (offline support) needs HTTPS, so host it somewhere static and free,
such as GitHub Pages, Netlify or Cloudflare Pages. Then:

1. Open the URL in **Safari**.
2. Tap Share → **Add to Home Screen**.

## Layout

```
index.html            app shell
css/app.css           iOS-style styling, light/dark tokens
js/app.js             UI: converter, keypad, menus, picker sheet, charts view, tabs
js/calc.js            keypad calculator (+ − × ÷)
js/send.js            Send money destinations: templates, URLs, backup codes
js/settings.js        Settings tab and destination editor
js/sound.js           keypad click sound
js/ui.js              shared modal / action sheet / toast helpers
js/rates.js           rate fetching, conversion, history
js/currencies.js      currency list, names, flags, number formatting
icons/flags/          circular flags from HatScripts/circle-flags (MIT)
js/chart.js           SVG line chart with touch scrubbing
sw.js                 offline cache
manifest.webmanifest  install metadata
```

When you deploy changes, bump `VERSION` in `sw.js`.
