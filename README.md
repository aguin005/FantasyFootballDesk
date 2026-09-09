# League desk

A personal fantasy football dashboard that pulls your Sleeper and ESPN leagues, flags news and
injuries on players you roster, and ranks the best available free agents.

No server. A scheduled GitHub Action fetches the data and rebuilds the site, GitHub Pages hosts it,
and your phone opens it like an app.

```
GitHub Actions (every 30 min)          GitHub Pages
┌───────────────────────────┐          ┌──────────────────┐
│ scripts/refresh.mjs       │          │ React dashboard  │
│  Sleeper API   (no auth)  │  writes  │                  │
│  ESPN API      (cookies)  │ ───────► │ reads            │
│  ESPN news and injuries   │  JSON    │ data/dashboard   │
└───────────────────────────┘          └──────────────────┘
```

## What you need

- Node 20 or newer
- A GitHub account
- Your Sleeper username
- Your ESPN league id, team id, and two browser cookies

## Step 1. Get the project running locally

```bash
npm install
```

## Step 2. Fill in leagues.config.json

```json
{
  "sleeper": { "username": "your_sleeper_username" },
  "espn": [{ "leagueId": "123456", "teamId": 3, "label": "Work league" }]
}
```

Sleeper leagues are discovered automatically from your username, so you never list them. Every
league that account joins shows up on the next refresh.

ESPN leagues have to be listed by hand. Find the ids this way:

1. Open your league on `fantasy.espn.com`. The URL contains `leagueId=123456`.
2. Click your own team. The URL now also contains `teamId=3`.

If you guess the team id wrong, the refresh script prints every team in that league with its id, so
run it once and read the error.

## Step 3. Get your ESPN cookies

ESPN has no public API and no tokens. Private leagues authenticate with two cookies from your
browser session.

1. Log in to `fantasy.espn.com` in Chrome.
2. Open DevTools with F12, go to the Application tab.
3. In the left sidebar, open Storage, then Cookies, then `https://fantasy.espn.com`.
4. Copy the values of `espn_s2` and `SWID`.

`espn_s2` is long and URL encoded. `SWID` includes the curly braces, keep them.

Put them in a local `.env` file, which is already gitignored:

```
ESPN_S2=AEB...long...string
SWID={1234ABCD-56EF-78GH-90IJ-KLMNOPQRSTUV}
```

Then run the refresh with those loaded:

```bash
set -a && source .env && set +a
npm run refresh
```

You should see something like `Wrote 3 leagues and 5 alerts`.

Treat these cookies like a password. They grant access to your ESPN account, which is exactly why
they live in GitHub Secrets later and never in the repo.

## Step 4. Look at it locally

```bash
npm run dev
```

Open the printed localhost URL. If the page says there is no data yet, step 3 did not write
`web/public/data/dashboard.json`, so read the error it printed.

## Step 5. Push to GitHub

Create a new **public** repository. Public matters for two reasons: Actions minutes are unlimited on
public repos, and Pages on a private repo requires a paid plan. Your roster data becomes publicly
readable, which is harmless. Your cookies never do, because they go in Secrets.

```bash
git init
git add .
git commit -m "Fantasy dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

## Step 6. Add the secrets

In the repo, go to Settings, then Secrets and variables, then Actions, then New repository secret.
Add two:

- `ESPN_S2`
- `SWID`

## Step 7. Turn on Pages

Settings, then Pages, then under Build and deployment set Source to **GitHub Actions**. Do not pick
"Deploy from a branch", since this project deploys the built site as an artifact.

## Step 8. Run it

Actions tab, pick "Refresh and deploy dashboard", then Run workflow. It runs in about a minute. When
it finishes, your dashboard is at `https://YOUR_NAME.github.io/YOUR_REPO/`.

After that it refreshes every 30 minutes on its own.

## Step 9. Put it on your phone

Open the URL in Safari or Chrome on your phone, then Add to Home Screen. The manifest makes it open
full screen without browser chrome.

## How the pieces fit

```
scripts/
  refresh.mjs            orchestrates a run and writes the JSON the site reads
  adapters/sleeper.mjs   Sleeper API, plus the daily cached player dump
  adapters/espn.mjs      ESPN API, cookie auth, the X-Fantasy-Filter header
  lib/crosswalk.mjs      maps Sleeper ids to ESPN ids so news matches players
  lib/news.mjs           ESPN news and injury feeds
  lib/waivers.mjs        the ranking model
  lib/http.mjs           fetch with retries
web/                     Vite and React dashboard
.github/workflows/       the scheduled job
```

The crosswalk is the quiet load bearing piece. Sleeper's player dump carries `espn_id` on every
record, so one file gives you a map between the two platforms and lets ESPN's news feed, which tags
articles with athlete ids, attach stories to players in your Sleeper leagues too.

## How waivers are ranked

Three signals, blended, each normalized to the pool of available players in that league:

| Signal | Weight | Where it comes from |
| --- | --- | --- |
| Projected points above your worst starter at that position | 0.5 | ESPN |
| Adds across Sleeper in the last 24 hours | 0.3 | Sleeper |
| Change in rostered percentage today | 0.2 | ESPN |

Signals a platform cannot supply are dropped and the rest are renormalized, so a Sleeper league
ranks on add velocity alone rather than being penalized for missing projections.

Replacement level is your own roster, not a league average. A player only scores well if starting
him would actually change your lineup. Tune the weights in `leagues.config.json`.

## Things that will eventually break

- **ESPN cookies expire.** Roughly once a year, or immediately if you change your password or log
  out everywhere. The workflow fails with an auth error. Repeat step 3 and update the secrets.
- **Scheduled workflows get disabled** on public repos after about 60 days of no repository
  activity. GitHub emails you first. Push any commit to reset it.
- **Cron is best effort.** Runs can land 5 to 15 minutes late when GitHub is busy.
- **ESPN's API is undocumented** and changes without notice, usually between seasons. If a view
  stops returning what it used to, open DevTools on the fantasy site, watch the Network tab, and
  copy what the site itself requests.

## Worth building next

- Diff each run against the previous one so the top strip shows what changed since you last looked
  rather than everything currently true.
- Push notifications through ntfy.sh when a starter gets downgraded, which is a few lines in the
  refresh script.
- Snap share and target share from `nflverse` weekly data to catch role changes before projections
  move.
