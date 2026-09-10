# League desk

https://aguin005.github.io/FantasyFootballDesk/

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
| Projected points above your worst starter at that position | 0.40 | ESPN |
| Snap share, target share, and depth chart rank | 0.25 | nflverse |
| Adds across Sleeper in the last 24 hours | 0.20 | Sleeper |
| Change in rostered percentage today | 0.15 | ESPN |

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

## What changed, rather than what is true

The top strip answers one question: what is different since you last looked. Each run is diffed
against the previous one and reports injury status changes, new stories, roster adds and drops, and
players climbing into the top of the waiver board.

Finding the previous run needs no database. Locally the last `dashboard.json` is still on disk. In
Actions the checkout is clean, so the script fetches the copy already deployed to your Pages URL,
which it works out from `GITHUB_REPOSITORY`. Nothing is committed back to the repo.

Changes stay on the board for 24 hours. A refresh every 30 minutes would otherwise clear the strip
long before you opened it, and the script has no way to know when you last looked.

## Push notifications

Optional, and off until you set it up. ntfy.sh has no accounts and no API keys: you pick a topic
name, subscribe to it in their app, and anything posted to that topic arrives on your phone.

1. Install ntfy from the App Store or Play Store.
2. Pick a topic name. Anyone who knows it can read your notifications, so use something like
   `ff-desk-8f3a91c2` rather than `fantasy`.
3. Subscribe to that topic in the app.
4. Add it as a repository secret named `NTFY_TOPIC`.

To test locally: `NTFY_TOPIC=your-topic npm run refresh`.

Only starters getting worse are pushed, meaning a move to doubtful, out, IR, or suspended. Bench
players and good news stay on the dashboard without buzzing your phone. Tune the filter in
`scripts/lib/notify.mjs`.

## Role data from nflverse

Projections are backward looking. A back who took over a starting job on Sunday still carries a
backup's projection on Wednesday, which is the window where a claim is cheap.

`scripts/lib/usage.mjs` pulls three files from the nflverse data releases:

- `snap_counts_YYYY.csv` for snap percentage
- `stats_player_week_YYYY.csv` for target share
- `depth_charts_YYYY.csv` for depth chart rank

The join runs through `players.csv`, which carries `espn_id`, `gsis_id`, and `pfr_id` on every row,
so all three sources land on the ESPN ids the rest of the project uses.

In September the current season's snap and target files do not exist yet, since no games have been
played. The loader falls back to last season, averages its final four weeks rather than trusting a
single week, and labels every note "last season" so you know what you are reading. Depth charts are
published before week one, which makes them the only role signal that exists that early.

## Player portraits

ESPN's headshot CDN is keyed by the same athlete id as everything else, and the cutouts have
transparent backgrounds, so they sit on a dark page without a box. Sleeper covers anyone ESPN is
missing, team defenses get a logo, and a failed load falls back to initials on a position colored
disc.

No images are downloaded or stored. The JSON holds URLs and the browser fetches them.

## The tabs

**Lineup** is your roster with news, injury designations, and role notes.

**Start / sit** compares every starter against the bench players who could legally replace them,
same position, or any of RB, WR, and TE when the starter sits in a flex slot. Only swaps worth at
least a point are shown, since projections are not precise enough for anything tighter to mean
much. Starters who are hurt or on bye are surfaced regardless of the gap.

**Schedule** groups your roster by the day their NFL team kicks off, using nflverse `games.csv`, so
you can see how much of your lineup is still to play. Byes get their own group, and a starter on bye
is flagged.

**News** collects stories from several outlets and keeps only the ones that name a player on your
roster. Sources are RotoWire, ESPN, Yahoo, CBS Sports, and Pro Football Talk, listed in
`newsFeeds` in the config so you can drop any of them. Underdog has no public feed, their player
notes are app only.

ESPN's JSON feed tags articles with athlete ids, which is exact. Everything else is RSS with no ids,
so those are matched by name. Matching requires the full name, since a surname alone produces
constant false positives, and it indexes a suffix free variant because headlines write "Marvin
Harrison" where your roster says "Marvin Harrison Jr.". Anything not about your players is dropped
during the refresh, so it never reaches the browser.

**Waivers** is the ranked free agent board.

**Trade** appears on ESPN leagues only. ESPN returns every team's roster in the same call that
returns yours, so pricing a trade needs no extra requests. Sleeper does not publish projections, so
there is nothing to price against there.

Trade math runs on rest of season projections, which ESPN files under `scoringPeriodId: 0` rather
than a week number. The number shown is the change in projected points for each side. It does not
try to price positional scarcity or roster construction, because one confident number would be more
misleading than a rough one you interpret yourself.

## A note on route participation

Routes run is the number that actually separates a passing down back from a two down back, and it is
not available for free. nflverse carries no routes column in `pfr_advstats` or `ftn_charting`, and
both PFF and Fantasy Points Data sell it.

The substitute is the share of a player's touches that arrive through the air, computed over their
last four games. A back at 40% is catching passes, and a back at 12% is taking handoffs and leaving
the field on third down, which is the distinction that matters in PPR. It is a proxy, not the real
measurement, and the dashboard words it as touches rather than routes so it does not overclaim.

## Worth building next

- Matchup context, meaning how many points each defense has allowed to the position.
- A season long log of your waiver claims scored against what those players actually did.