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
  lib/feeds.mjs          RSS and Atom news feeds, each with fallback URLs
  lib/consensus.mjs      reads the waiver columns behind Writers' picks
  lib/waivers.mjs        the ranking model
  lib/opportunity.mjs    next man up, from depth charts and injuries
  lib/gamelog.mjs        weekly points and last season against this week's opponent
  lib/defense.mjs        points each defense allows to each position
  lib/picks.mjs          locks the top waiver picks each week and grades them against your starters
  lib/byes.mjs           bye weeks, next weeks' projections, and free agents for each bye week
  lib/injury.mjs         one injury vocabulary for every source
  lib/http.mjs           fetch with retries
  check-feeds.mjs        npm run feeds, which feeds answer and which columns can be read
web/src/
  App.jsx                the shell: nav bar, tab bar, league switcher, player sheet
  views/                 one file per tab
  lib/lineup.js          start and sit, lineup alerts, game states, all of it pure logic
  lib/matchup.js         the head to head and its live projection
  lib/streaming.js       defense streaming ratings
  lib/nflSchedule.js     the schedule panel's days, game states, and your players in each game
  lib/teams.js           team names and ESPN logo URLs
  lib/picks.js           wording for the waiver track record
  lib/byes.js            the bye planner: who covers each starter's bye, and what to drop
  components/SchedulePanel.jsx   the NFL schedule that pulls out from the right edge
  styles.css             the design system, including the Liquid Glass material
web/public/sw.js         offline support for the installed app
.github/workflows/       the scheduled job
```

The crosswalk is the quiet load bearing piece. Sleeper's player dump carries `espn_id` on most
records, so one file gives you a map between the two platforms and lets ESPN's news feed, which tags
articles with athlete ids, attach stories to players in your Sleeper leagues too.

Most is not all. In September 2026, 9 of the 17 players on one real Sleeper roster had no
`espn_id`, and every feature keyed to ESPN ids skipped them without a word: the weekly chart, ESPN
news, injury designations, and snap and target share. Sleeper records do carry the NFL's own gsis
id, and nflverse's players file, which the refresh already downloads, maps gsis ids to ESPN ids. So
each run fills the gaps from there first, and falls back to name and position for active players
when that pair is unique.

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
ranks without ESPN's ownership change rather than being penalized for it. A single player missing a
signal is different: where the league has projections, a player without one counts as projecting
zero. Dropping it instead ranked an injured free agent with no team first among the receivers, on
adds alone.

Adds are compared on a log scale, since a few players get hundreds of thousands in a day and most
get a handful, and a player nobody added takes part with zero. Leaving those out had ranked a
player with 5 adds below an otherwise identical player with none.

Replacement level is your own roster, not a league average. A player only scores well if starting
them would actually change your lineup. Players who are not playing this week, on IR, out, or
projecting zero, are left out of it: an injured back on the bench had set the baseline to zero, and
every free agent back read as a big upgrade over "your worst RB at 0.0". Tune the weights in `leagues.config.json`. A weight missing
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

## Player history

The player sheet charts fantasy points for every week this season, one column per week, with the
season average drawn across it and the best week labeled. Tap or hover a week for its opponent and
score, and open the table view for every number at once. A week with no column is a bye or a game
the player missed.

Under this week's game is how the player did against that same opponent last season, beside their
average across all of last season, since 18 points is a big day for a tight end and a quiet one for
a top quarterback. When they did not meet that team, it says so.

Both come from nflverse's weekly player stats, which carry the opponent, standard fantasy points,
and receptions for every game. Standard points plus your league's points per reception times
receptions gives your league's score: Sleeper's own setting, and ESPN's receptions scoring item,
full PPR when a league never changed it. Box score scoring can differ a little from a league that
pays six for a passing touchdown or counts return yards, and the sheet says so. Quarterbacks,
running backs, receivers, and tight ends only, since that file does not score kickers or defenses.

## Waiver track record

Whether the app's waiver picks were any good. Each week the top three pickups lock in at the
week's first kickoff, from the board as it stood just before, which is the last thing the app
recommended. After every week that follows, each pick's points are set against your lowest scoring
starter at the same position that week, which is the claim the waiver model makes.

When there is no board from before kickoff, because the app was set up mid week or the refresh was
down, a board from the first hour after kickoff stands in. Any later and the board has seen games,
so that week is skipped rather than graded with hindsight.

- **Waivers tab:** a line at the top of the Best view, "Week 4's top picks beat your starter 2 of 3
  times", opens the Track record chip, every locked week with each pick's latest result, a Beat or
  Missed tag, and its record since the pick.
- **Player sheet:** a past pick shows every week since it was picked, "Week 5: 14.2 vs James Cook,
  9.1".
- **Today:** under Top pickups, how last week's top pick did.

Both sides are scored from Sleeper's weekly stats, in your league's points per catch, so a league
with custom rules will see totals a little off from its own, but the comparison stays fair. A bye
week is skipped, and a pick who did not play scores zero, since that is what they would have scored
for you. A starter Sleeper has no stats id for is left out instead of counted as zero, which would
make any pick look good. Your lineup for a past week comes from Sleeper's matchup for that week or
ESPN's lineup for that scoring period, so it is the lineup you actually played.

The history is one small JSON file on its own branch, `pick-history`, so `main` never gets data
commits. The build job reads it before the refresh. When the refresh changes it, which happens
about twice a week, when picks lock and when a week is graded, a separate `history` job commits it.
That job is the only one with permission to push, and it runs no project code, just git plumbing on
the one file. Deleting the branch starts the record over, and a new season starts one on its own.

## Bye weeks

Which of your players have a bye coming up, and who to play that week.

- **Lineup tab, Byes view:** this week and the next two each get a card for every starter on bye,
  with who to play instead, the projection, the game, and the matchup. Later weeks list who is out
  and flag any slot your bench cannot fill, and a week with three or more starters out is called
  out.
- **Today:** a starter on bye with no one on the bench to cover now names the free agent to pick up,
  and a Byes next week card lists next week's byes while there is still time to claim.
- **Player sheet:** every player's bye week.

A starter's bye is covered from your bench first. A free agent takes over when nobody on the bench
can play the slot, or when they project at least 3 points more, since a pickup costs a claim and a
roster spot. Each pickup names the bench player to drop, the lowest season projection among those
the plan does not need, or says you have an open roster spot. Starters are the players in your
current lineup, and this week's bench choice is the one Start / sit makes, so the two never
disagree. Free agents who are doubtful or worse, or whose team is also on bye, are left out, and so
is anyone whose game this week has already kicked off.

Byes come from nflverse's `games.csv`, which the refresh already reads. This week's numbers are your
league's own. Later weeks use Sleeper's projections in your league's points per catch, for your
bench and the free agents alike, so each comparison stays within one source. Sleeper projects every
week of the season and adjusts for the opponent, but picks stop at three weeks out, since the free
agent pool will have changed by then. The matchup line is how that opponent has defended the
position this season, plus the betting line, which books usually post about a week ahead.

## Matchup context

How this week's opponent has defended the player's position, from the same nflverse file. Every row
there is one player's game and the defense on the other side, so adding up a position's points by opponent
and dividing by that defense's games played gives points allowed per game. Each league ranks the
defenses in its own scoring, and rank 1 allows the most, which is the matchup you want.

- **Player sheet:** "MIN allow 27.4 points a game to RBs, the 3rd most in the league. The average
  is 22.1, through 3 games."
- **Roster rows:** a note appears only for the six softest and six toughest defenses at that
  position, "Soft matchup, MIN allow the 3rd most to RBs", so the list stays quiet about ordinary
  matchups. An injury note takes the spot when there is one.

Defenses are ranked once they have played two games, so weeks 1 and 2 show none of this. Early
ranks rest on two or three games and move a lot from week to week, which is why the sheet says how
many games are behind the number.

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
- **News feeds move.** In 2026 CBS dropped its fantasy feed, FantasyPros moved theirs, and ESPN's
  RSS started answering scripts with an empty page. The refresh log shows `feed unavailable` for a
  source that stops working. Run `npm run feeds` to see what every feed returns, try a replacement
  with `npm run feeds -- <url>`, and add it to the source's `urls` list in `scripts/lib/feeds.mjs`.

## Keeping the schedule on time

GitHub treats a workflow schedule as a request rather than a promise. When Actions is busy it starts
scheduled runs late and drops some entirely, and the busiest moments are the top and bottom of every
hour. Scheduled on `0,30`, this repo got 5 to 7 of its 48 daily runs in September 2026, with gaps of
up to eight hours.

The workflow now asks at minutes 8, 23, 38, and 53. Those are quiet minutes, so more of the runs
land, and a dropped run costs 15 minutes instead of 30. Each run takes under a minute, and Actions
minutes are free on public repositories, so the extra runs cost nothing.

That made little difference in practice. On September 29, the day after the change, scheduled runs
still landed 5 and 6.5 hours apart.

### Game day mode

Around kickoff the workflow stops waiting on GitHub's schedule. When a run finds a game within three
hours of starting or still being played, a final job waits eight minutes and then starts the next
run itself, so scores, inactives, and injury news land about every ten minutes until the last game of
the day ends. After that the job is skipped and the regular schedule takes over.

- **Why this is allowed:** events caused by the workflow's own token normally start nothing, and
  `workflow_dispatch` is one of the two exceptions GitHub makes. The job needs the `actions: write`
  permission, which the workflow grants to that one job only.
- **No doubled pace:** a scheduled run can land in the middle of the loop. Before starting the next
  run, the waiting job checks for a newer run that is still going, and if there is one it steps aside
  and lets that run carry on.
- **Cost:** a waiting job holds a runner for most of each game window, up to about 28 hours in a
  week with one Thursday, Sunday, and Monday slate. Actions minutes are free on public repositories. On a private repository this would use up the free minutes quickly,
  so delete the `next` job there and use the outside trigger below.
- **How it starts:** the loop starts with the first run that lands inside a window, so on a slow day
  the first refresh after kickoff can still be late. The outside trigger below closes that gap.

During those windows the app expects a refresh every ten minutes. If half an hour passes without
one, it says so, and the next scheduled run restarts the loop.

### An outside trigger for the rest of the week

For a schedule you can count on every day, have an outside service start the workflow instead of
GitHub's scheduler. cron-job.org is free and works well.

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
older one's refresh, so nothing deploys twice. Fine-grained tokens expire, a year at most, so set a reminder to
renew it.

The dashboard shows a note when the data is more than three hours old, or 30 minutes old around
kickoff, and a stronger one after a day, which is when a stopped workflow is the likely cause rather
than GitHub running late.

## When the week turns over

Sleeper keeps calling it the old week until Wednesday, but Monday night to Wednesday is when waiver
claims and next week's lineup get decided. So once every game of the week has had four hours to
finish, the refresh moves on to the next week on its own: waivers rank on next week's projections,
defenses are graded on next week's opponents, start and sit covers next week's lineup, and the
matchup card shows next week's opponent. ESPN is asked for that week explicitly, since it would
otherwise answer with whichever week it considers current.

Last week's result stays on the matchup card, as "Week 3: Won 118.4 to 102.1 against Crashee Rice",
until the new week's first game starts.

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

A change already on the board stays read when a later run sees it again. That happens after a run
where ESPN's news feed failed: the next run finds every story missing from the one before and would
flag them all as new. For the same reason, when ESPN's injury feed fails, a designation that only
that feed knows is kept from the run before. Without it the player would read as healthy for a run
and as newly injured on the next, and the injury alert would go out twice. A designation from
Sleeper or from your ESPN league itself is never held, so a player they clear is cleared.

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

Tap any player anywhere to open their sheet: projections, a chart of their points in every week
this season, this week's game, how they did against this week's opponent last season, injury
detail, role notes, why the waiver model likes them, which outlets named them, and every story that
mentions them.

**Today** is the first screen, and it answers what you open the app to find out. It leads with this
week's matchup: your score and your opponent's, each side's projected final, how many starters each
side still has to play, and whether you are projected to win. Before kickoff the big numbers are the
projections, and once games start they become the live score. Tap it for the head to head, both
lineups slot against slot with points and projections for every starter. On a bye week the card
falls back to a summary of your own starters. The lineup check flags starters who are out, doubtful, or on bye along with who to start
instead, and questionable starters with their backup. Next week's byes follow, with who to play for
each. Below that are the last day's changes, the top three pickups, and the latest news.

**Lineup** has four views.

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
- *Byes* plans every bye week left this season, described under Bye weeks above.

**News** collects stories from several outlets and keeps only the ones that name a player on your
roster, with a filter for starters only. Sources are ESPN, RotoWire, FFToday, Pro Football Rumors,
RotoBaller, FantasyPros, The Fantasy Footballers, PFF, Yahoo, CBS Sports, and Pro Football Talk. To
use only some of them, list their names in `newsFeeds` in the config. Underdog has no public feed,
their player notes are app only.

The fantasy sites among them also publish the waiver and streaming columns that Writers' picks on the
Waivers tab is built from. Each column is read in full, but only the article itself: menus, related
links, and trending sidebars name players too, and counting those would read as a recommendation.
Players who are out this week are left out too, since a column names an injured starter to explain
why that player's backup is the add, which had Jayden Daniels showing as a pick from three writers.

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

## NFL schedule panel

A slim tab on the right edge of the screen pulls out the whole week's NFL schedule. Tap it, or drag
it toward the middle. Drag the panel back to the right, tap outside it, or press Escape to close it.

- **In kickoff order,** grouped by day in your own time zone, so a 9:30 AM game in Europe sits at
  the top of Sunday.
- **Each game** shows both teams' logos and names. Before kickoff it shows the time. Once a game
  starts it reads Live, and once nflverse records the score, the final with the loser grayed out.
- **Your players** are listed under their game, starters first and bench players grayed, which is
  usually why you are looking at the schedule.
- **Teams on bye** are at the bottom, with any of your players who are sitting out.
- **Tap a game** to open ESPN's game page, which is where live scores are. The dashboard itself has
  no live scores between refreshes.
- **It opens at today.** Once Thursday's game is over, the panel opens at Sunday.

Logos come from ESPN's CDN, with the version ESPN draws for dark backgrounds in dark mode, so the
Raiders' black shield stays visible. A logo that fails to load falls back to the standard version,
then to the team's abbreviation.

The schedule is nflverse's `games.csv`, which the refresh already reads for kickoff times and
betting lines. It was cached for a day, and in Actions the cache is restored from the day's first
run, so lines posted later that day, and now scores, waited until the next day. It is cached for an
hour now.

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

- A claim by time on bye week pickups, from each league's waiver settings. Sleeper sends its waiver
  day and ESPN its processing days and hour, so the app could say exactly when a claim has to go
  in.
- The same track record for your own claims, read from each league's transaction history, which
  would work back to week 1.
- Live scores polled from the browser during games for Sleeper leagues, whose API answers any
  site. ESPN leagues need your cookies, so they have to stay on the workflow.
- Kicker matchups. The nflverse weekly file has no kicking, so they would need another source.