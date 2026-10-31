# Rates — agent notes

A multi-currency converter and exchange-rate charting PWA in the style of the XE app, built
for iPhone (installed from Safari to the Home Screen). React + TypeScript, built with Vite,
plain CSS. Hosted on GitHub Pages: <https://msimmer.github.io/currency-converter/>.

An npm workspace with two packages:

- `app/`: the PWA.
- `worker/`: a Cloudflare Worker that sends rate-alert push notifications (setup in
  `worker/README.md`).

## Commands (from the repo root)

| | |
|---|---|
| `npm run dev` | App dev server at <http://localhost:8642> (no service worker in dev) |
| `npm run preview` | Serve the production build, service worker included, at the same port |
| `npm run dev:worker` | Worker at <http://localhost:8787> (needs `worker/.dev.vars`) |
| `npm test` | Vitest, both packages |
| `npm run typecheck` | `tsc` for both packages |
| `npm run build` | `app/dist` and a dry-run Worker bundle in `worker/dist` |
| `npm run deploy` | Worker (`wrangler deploy`), then the app (`gh-pages` branch) |

`npm run deploy:app` / `deploy:worker` deploy one side. Run `npm test` and `npm run typecheck`
after changes. Pushing app changes to `main` deploys the app
(`.github/workflows/deploy-app.yml`); the Worker only deploys by hand. When deploying the app
by hand, do it from a clean, committed tree: Settings → About shows the build date and commit
(`+` marks uncommitted changes).

## App layout (`app/`)

- `src/App.tsx`: owns the state and wires up the views: rates refresh, the calculator,
  row menus, Send money, tabs, the alert deep links (`#pair=CAD-USD`, service worker messages).
- `src/components/`: `Converter` (list, edit mode, drag to reorder), `Keypad`,
  `ChartView` + `Chart` (SVG), `CurrencyPicker`, `Settings` + `DestinationEditor` +
  `AlertsSetting`; shared `ActionSheet`/`Toast` providers, `useModal` (sheet open/close
  transitions), `icons.tsx`.
- `src/lib/`: no React here. `state.ts` (saved state `state:v1` and every change to it,
  as pure functions), `rates.ts`, `currencies.ts` (names, flags, number formatting),
  `calc.ts`, `send.ts` (destinations, stored only on the device under `send:v1`), `alerts.ts`
  (push subscription + Worker API), `config.ts` (`ALERTS_API`), `sound.ts`, `dates.ts`.
- `src/sw.ts`: the service worker. `vite.config.ts` builds it separately as `dist/sw.js` (an
  IIFE at a fixed URL) and injects the shell's file list and a content-hash version, so a
  deploy always installs a new shell. There's no version to bump.
- `src/app.css`: one plain stylesheet. Components keep the class names and ids it uses.
- `public/`: manifest, icons, `icons/flags/` (circle-flags, MIT).
- `test/`: unit tests for `lib/`.

## Worker layout (`worker/`)

`src/index.ts` (HTTP API + hourly cron), `src/alerts.ts` (2-week high/low detection,
notification text), `src/webpush.ts` (VAPID + aes128gcm with WebCrypto only, no deps).
Wrangler bundles the TS itself; `tsc` only typechecks. Types are from
`@cloudflare/workers-types`. Their SubtleCrypto signatures are loose, hence a few casts.

## Data

All rates are USD-based. Latest rates and metals come from fawazahmed0/exchange-api (two
mirrors, the newer wins). History uses Frankfurter when both codes are ECB currencies
(back to 1999), otherwise sampled fawazahmed0 dated snapshots (back to 2024-03-02). No API
keys anywhere. Metals (XAU, XAG, XPT, XPD) are per troy ounce and are presented as prices
(XAU/CAD, not CAD/XAU) in alerts.

## Conventions

- iOS Safari is the primary target. Keep iOS quirks intact: keypad keys act on
  `pointerdown`, audio and push subscription must start straight from a user gesture (no
  `await` before `pushManager.subscribe`), safe-area insets, `100dvh`.
- Pure logic goes in `src/lib/` with a test; components stay thin.
- Comments explain why, not what. Keep the existing tone: short, plain sentences.
- User-facing copy uses typographic quotes and apostrophes (’ “ ”).
- Nothing personal (send destinations, push keys) goes in the repo. The VAPID private key is
  a Wrangler secret; `.dev.vars` and `.env` are git-ignored.
