import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { api, getAdminPassword, setAdminPassword, UnauthorizedError } from './api'
import type { Game, Team, WeekInfo } from './api'
import { GameCard } from './GameCard'
import { Standings } from './Standings'

const POSTSEASON_SHORT: Record<number, string> = { 1: 'Wild Card', 2: 'Divisional', 3: 'Conf', 4: 'Super Bowl' }

const weekKey = (w: { seasonType: number; week: number }) => `${w.seasonType}-${w.week}`
const weekText = (w: WeekInfo) => (w.seasonType === 3 ? POSTSEASON_SHORT[w.week] ?? `Playoffs ${w.week}` : String(w.week))

export default function App() {
  const [tab, setTab] = useState<'scores' | 'standings'>('scores')
  const [teams, setTeams] = useState<Team[]>([])
  const [weeks, setWeeks] = useState<WeekInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [standingsKey, setStandingsKey] = useState(0)
  const [canEdit, setCanEdit] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [password, setPassword] = useState("")
  const [loginError, setLoginError] = useState<string | null>(null)

  // Re-check a remembered password so a changed password locks the page again.
  useEffect(() => {
    const saved = getAdminPassword()
    if (!saved) return
    api.login(saved).then(() => setCanEdit(true)).catch(() => setAdminPassword(null))
  }, [])

  async function unlock(e: React.FormEvent) {
    e.preventDefault()
    setLoginError(null)
    try {
      await api.login(password)
      setAdminPassword(password)
      setCanEdit(true)
      setUnlocking(false)
      setPassword("")
    } catch (err) {
      setLoginError(err instanceof UnauthorizedError ? "Wrong password" : "Could not reach the server")
    }
  }

  function lock() {
    setAdminPassword(null)
    setCanEdit(false)
  }

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])
  const current = weeks.find((w) => weekKey(w) === selected)

  const loadWeeks = useCallback(async () => {
    const w = await api.weeks()
    setWeeks(w)
    return w
  }, [])

  // First load: teams, weeks, then jump to the first week that still has unfinished games.
  useEffect(() => {
    Promise.all([api.teams(), loadWeeks()])
      .then(([t, w]) => {
        setTeams(t)
        const next = w.find((x) => x.final < x.total) ?? w[w.length - 1]
        if (next) setSelected(weekKey(next))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not reach the API'))
      .finally(() => setLoading(false))
  }, [loadWeeks])

  useEffect(() => {
    if (!current) return
    api.games(current.seasonType, current.week).then(setGames).catch((e) => setError(String(e)))
  }, [current?.seasonType, current?.week]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSaved(saved: Game) {
    setGames((gs) => gs.map((g) => (g.id === saved.id ? saved : g)))
    setStandingsKey((k) => k + 1)
    await loadWeeks()
  }

  async function refreshFromEspn() {
    setImporting(true)
    setError(null)
    try {
      await api.importSchedule()
      await loadWeeks()
      if (current) setGames(await api.games(current.seasonType, current.week))
      setStandingsKey((k) => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const regular = weeks.filter((w) => w.seasonType === 2)
  const post = weeks.filter((w) => w.seasonType === 3)

  return (
    <div className="app">
      <header className="top">
        <h1>NFL 2026 Tracker</h1>
        <nav className="tabs">
          <button className={tab === 'scores' ? 'active' : ''} onClick={() => setTab('scores')}>
            Scores
          </button>
          <button className={tab === 'standings' ? 'active' : ''} onClick={() => setTab('standings')}>
            Standings
          </button>
        </nav>
        {canEdit ? (
          <>
            <button className="secondary" onClick={refreshFromEspn} disabled={importing} title="Re-read the schedule from ESPN. Games you've edited are not overwritten.">
              {importing ? "Refreshing…" : "Refresh schedule"}
            </button>
            <button className="secondary" onClick={lock}>
              Lock
            </button>
          </>
        ) : unlocking ? (
          <form className="unlock" onSubmit={unlock}>
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus aria-label="Edit password" />
            <button className="primary" type="submit">
              Unlock
            </button>
            <button className="secondary" type="button" onClick={() => { setUnlocking(false); setLoginError(null) }}>
              Cancel
            </button>
            {loginError && <span className="error">{loginError}</span>}
          </form>
        ) : (
          <button className="secondary" onClick={() => setUnlocking(true)}>
            Unlock editing
          </button>
        )}
      </header>

      {error && <div className="error banner">{error}</div>}
      {loading && <p className="muted">Loading…</p>}

      {tab === 'scores' && !loading && (
        <>
          <div className="week-picker">
            <span className="group-label">Regular season</span>
            <div className="chips">
              {regular.map((w) => (
                <WeekChip key={weekKey(w)} w={w} active={weekKey(w) === selected} onClick={() => setSelected(weekKey(w))} />
              ))}
            </div>
            {post.length > 0 && (
              <>
                <span className="group-label">Postseason</span>
                <div className="chips">
                  {post.map((w) => (
                    <WeekChip key={weekKey(w)} w={w} active={weekKey(w) === selected} onClick={() => setSelected(weekKey(w))} wide />
                  ))}
                </div>
              </>
            )}
          </div>

          {current && (
            <h2 className="week-title">
              {current.seasonType === 3 ? current.label ?? weekText(current) : `Week ${current.week}`}
              <small>
                {current.final}/{current.total} final
              </small>
            </h2>
          )}

          <div className="grid">
            {games.map((g) => (
              <GameCard key={`${g.id}-${g.status}-${g.homeScore}-${g.awayScore}-${canEdit}`} game={g} teams={teamMap} teamList={teams} onSaved={onSaved} onUnauthorized={lock} canEdit={canEdit} />
            ))}
          </div>
        </>
      )}

      {tab === 'standings' && <Standings refreshKey={standingsKey} />}
    </div>
  )
}

function WeekChip({ w, active, onClick, wide }: { w: WeekInfo; active: boolean; onClick: () => void; wide?: boolean }) {
  const done = w.total > 0 && w.final === w.total
  return (
    <button
      className={`chip ${active ? 'active' : ''} ${done ? 'done' : ''} ${wide ? 'wide' : ''}`}
      onClick={onClick}
      title={`${w.final}/${w.total} games final`}
    >
      {weekText(w)}
    </button>
  )
}
