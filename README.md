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
