# NFL Tracker

Tracks the 2026 NFL regular season and postseason. Past games are pre-filled from ESPN; you enter scores for new games and mark them final.

- `api/` – .NET 9 minimal API + SQLite (`nfl.db`, created on first run)
- `web/` – React + Vite UI

## Run

```
cd api && dotnet run --urls http://localhost:5028
cd web && npm run dev
```

Open http://localhost:5173.

## Notes

- First API start imports teams, the full schedule, and every final score so far (takes ~15 seconds).
- Playoff games are created as "TBD" slots. Pick the teams from the dropdowns once matchups are set, or press **Refresh schedule** to let ESPN fill them in.
- **Refresh schedule** never overwrites a game you've edited yourself.
- To start over, stop the API and delete `api/nfl.db`.

## Betting lines and simulated bets

- Spread, total, and moneyline come from DraftKings via ESPN. Books post lines a week or two ahead, so far-off weeks show none yet. The API refreshes lines every 3 hours (**Refresh schedule** does it on demand) and keeps the last lines once a game starts.
- Bets use play money ($1,000 starting bankroll). While unlocked, tap a line on any scheduled game, pick a stake, and place the bet. The line and odds are locked in when you place it.
- Bets settle automatically when a game is marked final, and re-open if you edit that score. Pending bets can be cancelled for a refund. **Reset bankroll** on the Bets tab starts over.
- Click any team (on a card, in Standings, or on the Bets tab) to see its full schedule with results, bye week, and upcoming lines.

## Playoff bracket

The **Playoffs** tab draws the AFC and NFC brackets meeting at the Super Bowl. Games land in the right conference once their teams are set (pick teams on the Scores tab, or let **Refresh schedule** pull them from ESPN). Undecided games show as TBD, and a champion banner appears when the Super Bowl is final. Tap a round title to jump to that round on the Scores tab.

## Records and hover cards

Every team name shows its regular-season record on the game cards and in the bracket. Hover a team (or tab to it) for a card with division rank, home/away/division records, points for and against, streak, last result, and next game with its line. Click through for the full schedule.

## Editing password

Anyone can view scores and standings. Changing scores, picking playoff teams, and **Refresh schedule** need a password:

- Locally: `nfl-dev` (set in `api/appsettings.Development.json`)
- Production: `Admin__Password` in `/etc/nfltracker/env` on the server

Click **Unlock editing** in the header. The browser remembers the password until you press **Lock**.

## Deploy (nfl.brianfreestone.com)

Every push to `main` runs `.github/workflows/deploy.yml`: it builds the API (self-contained linux-x64) and client, smoke-tests the API, copies both to the server over the Cloudflare tunnel, and restarts the `nfltracker` service. It needs the repo secrets `SSH_PRIVATE_KEY`, `SSH_HOST`, and `SSH_USER` (same values as the Lawncare repo).

One-time server setup (folders, edit password, systemd service, nginx site, tunnel route), from the repo root in Git Bash:

```
bash deploy/first-time-setup.sh brian@10.0.0.94
```

The database lives in `/var/www/nfltracker/data` and a deploy never touches it.
