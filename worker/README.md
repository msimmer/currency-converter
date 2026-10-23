# Rate alerts Worker

Sends the app's push notifications: when a currency in your list hits a 2-week high or low
against your "You convert" currency, e.g.

> 🇨🇦 🇺🇸 **CAD/USD hits 0.7156 📈**
> The Canadian Dollar rises to a 2 week high against the US Dollar.

Tapping one opens that pair's chart.

## Why there's a server at all

An iPhone web app can't run in the background or wake itself on a timer. The only way
it can show a notification while closed is **Web Push**: a server sends a message to
Apple, and Apple delivers it to the phone. So something has to check the rates every day and
do the sending. This is that something: a small [Cloudflare Worker](https://developers.cloudflare.com/workers/)
(a script that runs on Cloudflare's servers, free at this size).

The app itself stays where it is (GitHub Pages). Only this folder runs on Cloudflare.
You don't need anything from AWS (CloudFront is Amazon's CDN and is unrelated).

## How it works

```
iPhone app ──(subscribe + your currency list)──▶ Worker ──▶ KV storage
                                                   │
                     every hour (cron) ────────────┤ fetch the last 15 days of rates
                                                   │ any pair at a 2-week high/low?
iPhone ◀──── Apple push service ◀──(Web Push)──────┘ 8 am–9 pm your time, once per pair per day
```

- **Pairs**: your "You convert" currency against every other currency in your list,
  so there's nothing to set up per pair. Change your list and the Worker picks it up.
  Metals read as prices (XAU/CAD rather than CAD/XAU).
- **2-week high**: the latest daily rate is above every rate in the previous 14 days (low: below).
- **Data**: the same free daily rates the app uses (fawazahmed0/exchange-api).
- **Storage**: one KV entry per phone holding its push subscription, currency list and time zone.

## What wrangler is

`wrangler` is Cloudflare's command-line tool for Workers. It logs in to your Cloudflare
account, uploads the code (`deploy`), stores secrets, runs the Worker locally (`dev`)
and streams its logs (`tail`). It's installed with `npm install` in this folder, so you
run it as `npx wrangler …` (or through the `npm run` shortcuts below). Its settings live
in `wrangler.jsonc`.

## Setup (one time, about 10 minutes)

You need Node.js 20 or newer (`node --version`).

**Run every command below from the `worker` folder** (`cd ~/code/currency-converter/worker`).
Wrangler reads its settings from `wrangler.jsonc` in the current folder. Run from anywhere else,
it fails with "Required Worker name missing" (and `npx` offers to download wrangler again).

1. **Create a Cloudflare account** at <https://dash.cloudflare.com/sign-up>. The free plan is enough.
   You don't need a domain.

2. **Install and log in**
   ```sh
   cd worker
   npm install
   npx wrangler login        # opens the browser to authorize wrangler
   ```

3. **Create the storage** (a KV namespace)
   ```sh
   npx wrangler kv namespace create ALERTS
   ```
   It prints an `id`. Put it in `wrangler.jsonc` in place of `PASTE_KV_NAMESPACE_ID`.
   (If wrangler offers to add it to the config for you, say yes, then check that the binding is named `ALERTS`.)

4. **Make the push keys** (VAPID keys identify your server to Apple)
   ```sh
   npm run vapid-keys
   ```
   Put the **public** key in `wrangler.jsonc` in place of `PASTE_VAPID_PUBLIC_KEY`.
   Keep the terminal open for the private key.

5. **Deploy**
   ```sh
   npm run deploy
   ```
   The first time, it asks you to pick a `workers.dev` subdomain. At the end it prints
   the Worker's URL, like `https://rates-alerts.your-name.workers.dev`.

6. **Store the private key** as a secret (encrypted, never in the code)
   ```sh
   npx wrangler secret put VAPID_PRIVATE_KEY
   ```
   Paste the private key from step 4 when asked. Then clear that terminal.

7. **Check it**: `curl https://rates-alerts.your-name.workers.dev/config` should print your public key.

8. **Point the app at it**: in `js/config.js`, set
   ```js
   export const ALERTS_API = 'https://rates-alerts.your-name.workers.dev';
   ```
   then commit and push so GitHub Pages serves the update.

9. **Turn it on on the iPhone**: open Rates **from the Home Screen icon** (not a Safari tab),
   wait a moment for the update, then go to **Settings → Rate alerts**, switch on
   **2-week highs & lows**, tap **Allow**, then tap **Send a test**. If the app still looks old,
   close it from the app switcher and open it again.

If you host the app somewhere other than `https://msimmer.github.io`, change `ALLOWED_ORIGIN`
(and `VAPID_SUBJECT`) in `wrangler.jsonc` and deploy again.

## Everyday commands (run in `worker/`)

| Command | What it does |
|---|---|
| `npm run deploy` | Upload the current code to Cloudflare |
| `npm run logs` | Stream live logs (leave it running, then tap **Send a test**) |
| `npm test` | Run the tests (no Cloudflare needed) |
| `npm run dev` | Run the Worker locally at http://localhost:8787 (needs a `.dev.vars` file, below) |

To run locally, create `worker/.dev.vars` (git-ignored) with test keys from `npm run vapid-keys`:

```
VAPID_PUBLIC_KEY=…
VAPID_PRIVATE_KEY=…
ALLOWED_ORIGIN=http://localhost:8642
```

and trigger a cron run with `curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"`.

You can also see the Worker, its cron runs, logs and KV data in the Cloudflare dashboard under
**Workers & Pages → rates-alerts** and **Storage & Databases → KV**.

## Troubleshooting

- **No switch, or "Add Rates to your Home Screen"**: notifications only work in the
  Home Screen app (iOS 16.4 or later), not in a Safari tab.
- **"Notifications are off"**: iPhone Settings → Notifications → Rates → Allow Notifications.
  Check that a Focus mode isn't hiding them.
- **Test fails**: run `npm run logs` and tap **Send a test** again to see the error.
- **No alerts for days**: that's normal when rates move sideways. A pair only alerts on a new
  2-week extreme. The test notification proves the delivery path works.
- **New keys**: if you ever replace the VAPID keys, switch alerts off and on again on the phone.

## Cost

Within the free plan: one cron run an hour, about 15 rate fetches per run, and a few KV reads and writes a day.

## API (used by `js/alerts.js`)

| Request | Body | |
|---|---|---|
| `GET /config` | | `{ publicKey }` |
| `PUT /subscription` | `{ subscription, base, codes, names, timeZone }` | save or update this phone |
| `DELETE /subscription` | `{ endpoint }` | forget this phone |
| `POST /test` | `{ endpoint }` | send a test notification |

Only requests from `ALLOWED_ORIGIN` are allowed by CORS, and subscriptions must point at a
real push service (Apple, Google, Mozilla or Microsoft).
