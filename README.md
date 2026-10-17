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

Every push to `main` runs `.github/workflows/deploy.yml`: it builds the API (self-contained linux-x64) and client, smoke-tests the API, copies both to the server over the Cloudflare tunnel, and restarts the `nfltracker` service. It needs the repo secrets `SSH_PRIVATE_KEY`, `SSH_HOST`, and `SSH_USER` (same values as the Lawncare repo).

One-time server setup (folders, edit password, systemd service, nginx site, tunnel route), from the repo root in Git Bash:

```
bash deploy/first-time-setup.sh brian@10.0.0.94
```

The database lives in `/var/www/nfltracker/data` and a deploy never touches it.
