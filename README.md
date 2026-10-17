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

## Editing password

Anyone can view scores and standings. Changing scores, picking playoff teams, and **Refresh schedule** need a password:

- Locally: `nfl-dev` (set in `api/appsettings.Development.json`)
- Production: `Admin__Password` in `/etc/nfltracker/env` on the server

Click **Unlock editing** in the header. The browser remembers the password until you press **Lock**.

## Deploy (nfl.brianfreestone.com)

From the repo root, in Git Bash:

```
bash deploy/deploy.sh brian@10.0.0.94
```

This builds both projects, uploads them, and runs `deploy/server-install.sh` on the server. The first run also asks you to choose the edit password and sets up the service, nginx site, and Cloudflare tunnel route. Later runs only swap in the new build. The database lives in `/var/www/nfltracker/data` and is never touched by a deploy.
