# League desk

https://aguin005.github.io/FantasyFootballDesk/

A personal fantasy football dashboard that pulls your Sleeper and ESPN leagues, flags news and
injuries on players you roster, and ranks the best available free agents.

No server. A scheduled GitHub Action fetches the data and rebuilds the site, GitHub Pages hosts it,
and your phone opens it like an app.

```
GitHub Actions (every 15 min)          GitHub Pages
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

After that it refreshes on its own, asking four times an hour. GitHub does not always run it that
often, which is what the next section is about.

## Step 9. Put it on your phone

Open the URL in Safari or Chrome on your phone, then Add to Home Screen. The manifest makes it open
full screen without browser chrome, and a service worker keeps the last copy of your data so it
still opens with no signal. Pull down from the top of any screen to fetch the newest data, the same
gesture as any iOS list.

## How the pieces fit

```
scripts/
  refresh.mjs            orchestrates a run and writes the JSON the site reads
  adapters/sleeper.mjs   Sleeper API, plus the daily cached player dump
  adapters/espn.mjs      ESPN API, cookie auth, the X-Fantasy-Filter header
  lib/crosswalk.mjs      maps Sleeper ids to ESPN ids so news matches players
  lib/news.mjs           ESPN news and injury feeds
  lib/waivers.mjs        the ranking model
  lib/opportunity.mjs    next man up, from depth charts and injuries
  lib/injury.mjs         one injury vocabulary for every source
  lib/http.mjs           fetch with retries
web/src/
  App.jsx                the shell: nav bar, tab bar, league switcher, player sheet
  views/                 one file per tab
  lib/lineup.js          start and sit, lineup alerts, game states, all of it pure logic
  lib/matchup.js         the head to head and its live projection
  lib/streaming.js       defense streaming ratings
  styles.css             the design system, including the Liquid Glass material
web/public/sw.js         offline support for the installed app
.github/workflows/       the scheduled job
```

The crosswalk is the quiet load bearing piece. Sleeper's player dump carries `espn_id` on every
record, so one file gives you a map between the two platforms and lets ESPN's news feed, which tags
articles with athlete ids, attach stories to players in your Sleeper leagues too.

## How waivers are ranked

Five signals, blended, each normalized to the pool of available players in that league:

| Signal | Weight | Where it comes from |
| --- | --- | --- |
| Projected points above your worst starter at that position | 0.40 | ESPN or Sleeper |
| An injury ahead of them on the depth chart, see "Next man up" | 0.30 | Sleeper and ESPN |
| Snap share, target share, and depth chart rank | 0.25 | nflverse |
| Adds across Sleeper in the last 24 hours | 0.20 | Sleeper |
| Change in rostered percentage today | 0.15 | ESPN |

Signals a platform cannot supply are dropped and the rest are renormalized, so a Sleeper league
ranks on add velocity alone rather than being penalized for missing projections.

Replacement level is your own roster, not a league average. A player only scores well if starting
them would actually change your lineup. Tune the weights in `leagues.config.json`. A weight missing
from an older config falls back to the default above rather than to zero.

The board keeps the best 25 overall plus at least eight at every position, and every free agent
defense, so one crowded position can never push another off it. Before this, a week of strong
defense projections filled an ESPN board with 17 defenses and not a single running back.

## Next man up

When a starter goes down, the player behind them inherits the role before any projection catches
up, and that is the cheapest moment to claim them. Every run checks the whole NFL for these openings
from data it already downloads. Sleeper's player database carries each player's team, position,
depth chart order, and injury status. Sleeper's projections cover everyone, and ESPN's injury feed
fills in any status Sleeper lacks.

A free agent has an opening when a teammate at the same position who ranked ahead of them is out,
doubtful, on IR, or suspended, and the healthy players left put them in the starting group: the lead
back, the starting quarterback or tight end, or one of the top three receivers. Ranked ahead means a
higher season projection, or a better spot on the depth chart for a starter whose season projection
was cut after landing on IR. A back who moves up to RB2 counts too, at lower weight. Questionable
starters open nothing, since most of them play.

These players are kept on the board even when Sleeper ranks them too low to list, and added in ESPN
leagues when ESPN's free agent list, which only covers the 150 most rostered players, leaves them
out. When the injured player is on your own roster, the backup is marked as your handcuff and the
Today tab's lineup check tells you to pick them up.

## Streaming defenses

A defense scores on sacks, turnovers, and points allowed, and all three depend on the offense it
faces far more than on the defense itself. The betting market is the best free read on that offense,
and the nflverse schedule the refresh already downloads carries every game's spread and over/under.
Half of the total plus half of the spread, from each side, gives both teams' implied points.

Each defense is rated 0 to 100 on this week's projection (45%), how few points the opponent is
expected to score (40%), and how much its own team is favored by (15%), since a trailing offense
throws more, and a thrown ball can be picked off or end in a sack. Your own defense is rated on the
same scale, and the board says to stream when a free agent beats yours by 10 or more. Next week's
opponent is shown too, since the defense you claim now is often the one you start next week.

Lines are missing until books post them, and those games are rated on the projection alone. The
schedule file is cached for a day, so lines update once a day.

## Things that will eventually break

- **ESPN cookies expire.** Roughly once a year, or immediately if you change your password or log
  out everywhere. The workflow fails with an auth error. Repeat step 3 and update the secrets.
- **Scheduled workflows get disabled** on public repos after about 60 days of no repository
  activity. GitHub emails you first. Push any commit to reset it.
- **Cron is best effort.** GitHub runs scheduled workflows late, or skips them, when Actions is
  busy. See "Keeping the schedule on time" below.
- **ESPN's API is undocumented** and changes without notice, usually between seasons. If a view
  stops returning what it used to, open DevTools on the fantasy site, watch the Network tab, and
  copy what the site itself requests.

## Keeping the schedule on time

GitHub treats a workflow schedule as a request rather than a promise. When Actions is busy it starts
scheduled runs late and drops some entirely, and the busiest moments are the top and bottom of every
hour. Scheduled on `0,30`, this repo got 5 to 7 of its 48 daily runs in September 2026, with gaps of
up to eight hours.

The workflow now asks at minutes 8, 23, 38, and 53. Those are quiet minutes, so more of the runs
land, and a dropped run costs 15 minutes instead of 30. Each run takes under a minute, and Actions
minutes are free on public repositories, so the extra runs cost nothing.

That makes it much better but still not guaranteed. For a schedule you can count on, have an outside
service start the workflow instead of GitHub's scheduler. cron-job.org is free and works well.

1. On GitHub, go to Settings, then Developer settings, then Personal access tokens, then
   Fine-grained tokens, and generate a new one. Under Repository access pick only this repository.
   Under Permissions, set **Actions** to Read and write. Nothing else is needed. The token can start
   and manage workflow runs on this one repository, and it cannot read or change your code or
   secrets.
2. On cron-job.org, create a job that runs every 15 minutes with these settings:
   - URL: `https://api.github.com/repos/YOUR_NAME/YOUR_REPO/actions/workflows/refresh.yml/dispatches`
   - Request method: `POST`
   - Headers: `Authorization: Bearer YOUR_TOKEN`, `Accept: application/vnd.github+json`, and
     `X-GitHub-Api-Version: 2022-11-28`
   - Request body: `{"ref":"main"}`
3. Run it once from cron-job.org. A `204` response means it worked, and a new run appears in the
   Actions tab within seconds.

Leave the schedule in the workflow as a backup. If both fire at once, the newer run cancels the
older one, so nothing deploys twice. Fine-grained tokens expire, a year at most, so set a reminder to
renew it.

The dashboard shows a note when the data is more than three hours old, and a stronger one after a
day, which is when a stopped workflow is the likely cause rather than GitHub running late.

## What changed, rather than what is true

The What changed section on the Today tab answers one question: what is different since you last
looked. Each run is diffed
against the previous one and reports injury status changes, new stories, roster adds and drops, and
players climbing into the top of the waiver board.

Finding the previous run needs no database. Locally the last `dashboard.json` is still on disk. In
Actions the checkout is clean, so the script fetches the copy already deployed to your Pages URL,
which it works out from `GITHUB_REPOSITORY`. Nothing is committed back to the repo, and
`dashboard.json` is gitignored so a stale copy can never end up in the checkout and pose as the
previous run.

Changes stay on the board for 24 hours. A refresh every 15 minutes would otherwise clear the list
long before you opened it, and the script has no way to know when you last looked. New changes in a
league you are not looking at show as a red count on that league's chip.

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

Tap any player anywhere to open their sheet: projections, this week's game, injury detail, role
notes, why the waiver model likes them, which outlets named them, and every story that mentions
them.

**Today** is the first screen, and it answers what you open the app to find out. It leads with this
week's matchup: your score and your opponent's, each side's projected final, how many starters each
side still has to play, and whether you are projected to win. Before kickoff the big numbers are the
projections, and once games start they become the live score. Tap it for the head to head, both
lineups slot against slot with points and projections for every starter. On a bye week the card
falls back to a summary of your own starters. The lineup check flags starters who are out, doubtful, or on bye along with who to start
instead, and questionable starters with their backup. Below that are the last day's changes, the
top three pickups, and the latest news.

**Lineup** has three views.

- *Roster* is your starters, bench, and reserve, with injury designations and a dot on anyone with
  fresh news. Once a player's game starts, the projection gives way to the points they have scored.
- *Start / sit* compares every open slot against the bench players who could legally fill it: same
  position, RB, WR, or TE for a flex, and any of those plus QB for a superflex. Swaps are chosen
  for the whole lineup at once, so one bench player is never offered for two slots and the single
  biggest gain never blocks a better combination. Only upgrades worth at least a point are shown,
  since projections are not precise enough for anything tighter to mean much. Starters who are out,
  doubtful, or on bye are surfaced regardless of the gap. Anyone whose game has kicked off is
  locked on both platforms, so those slots are left alone.
- *Schedule* groups your roster by the day their NFL team kicks off, using nflverse `games.csv`,
  with each game marked live or played once it starts. Byes get their own group, and a starter on
  bye is flagged.

**News** collects stories from several outlets and keeps only the ones that name a player on your
roster, with a filter for starters only. Sources are RotoWire, ESPN, Yahoo, CBS Sports, and Pro
Football Talk, listed in `newsFeeds` in the config so you can drop any of them. Underdog has no
public feed, their player notes are app only.

ESPN's JSON feed tags articles with athlete ids, which is exact. Everything else is RSS with no ids,
so those are matched by name. Matching requires the full name, since a surname alone produces
constant false positives, and it indexes a suffix free variant because headlines write "Marvin
Harrison" where your roster says "Marvin Harrison Jr.". Anything not about your players is dropped
during the refresh, so it never reaches the browser.

**Waivers** is organized by the hole you are filling. The overview leads with next man up
openings, then the best two pickups at each position, then defenses to stream, then what the waiver
columns are recommending. Each position chip opens the full list for that position beside your own
players there, and the DEF chip opens the streaming board.

**Trade** appears whenever a league returns every team's roster, which both platforms do in the same
call that returns yours, so pricing a trade needs no extra requests. Pick a trading partner, tick
players on both sides, and a floating summary shows each side's total and the net.

Trade math runs on season projections: ESPN files them under `scoringPeriodId: 0` rather than a week
number, and Sleeper's come from the same projections host as its weekly numbers. The number shown
is the change in projected points for your side. It does not try to price positional scarcity or
roster construction, because one confident number would be more misleading than a rough one you
interpret yourself.

## Design

The dashboard follows Apple's platform conventions so it feels at home on an iPhone: the system
font, iOS system colors, grouped inset lists, a large title that collapses into the nav bar as you
scroll, and sheets you can drag down to dismiss. It follows the device's light or dark appearance,
and on an iPad or a desktop the tab bar turns into a sidebar.

Everything that floats above the content uses Liquid Glass, Apple's material from iOS 26: the tab
bar, the nav buttons, the player and matchup sheets, and the trade summary. On the web it is built from three
layers. A translucent tint with a heavy backdrop blur and saturation boost is the body, a gradient
rim that is brighter where light would catch the edges gives it thickness, and a soft sheen across
the top reads as a curved surface. The tab bar's selection lens slides between tabs on a spring,
which is the material's signature motion.

Glass is kept to the navigation layer on purpose, the way Apple uses it. Content sits on solid cards
because text on glass is harder to read. The glass turns solid under Reduce Transparency, motion
stops under Reduce Motion, borders strengthen under Increase Contrast, and browsers without
`backdrop-filter` get an opaque fallback.

Kickoff times and "updated" times are shown in your device's time zone, so they stay right when you
travel.

## How the live projection works

Scores are only as fresh as the last refresh, so the projected final is worked out as of the moment
the data was pulled rather than the moment you look. A starter whose game had not started counts
their projection. One whose game had finished counts what they scored. One mid game counts their
points so far plus the share of their projection still to be played, judged from how long the game
had been running against a typical three hours and ten minutes. A matchup only reads as final once
every game on both sides had ended when the data was pulled, so a score from halfway through Sunday
night is never shown as the result.

Sleeper's matchups come from its documented `/league/{id}/matchups/{week}` endpoint. ESPN's come from
the `mMatchupScore` view in a call of their own, kept separate from the main league call so that if
ESPN ever refuses it, only the matchup card is lost and the rest of the league still loads.

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