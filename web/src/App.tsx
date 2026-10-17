import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { api, getAdminPassword, setAdminPassword, UnauthorizedError } from './api'
import type { Bankroll, Bet, Game, Team, WeekInfo } from './api'
import { BetsPage } from './BetsPage'
import { GameCard } from './GameCard'
import { Standings } from './Standings'
import { TeamPage } from './TeamPage'

type Tab = 'scores' | 'standings' | 'bets'

const POSTSEASON_SHORT: Record<number, string> = { 1: 'Wild Card', 2: 'Divisional', 3: 'Conf', 4: 'Super Bowl' }

const weekKey = (w: { seasonType: number; week: number }) => `${w.seasonType}-${w.week}`
const weekText = (w: WeekInfo) => (w.seasonType === 3 ? POSTSEASON_SHORT[w.week] ?? `Playoffs ${w.week}` : String(w.week))

/** "#/team/12" -> 12, anything else -> null */
function teamIdFromHash(hash: string): number | null {
  const m = hash.match(/^#\/team\/(\d+)$/)
  return m ? Number(m[1]) : null
}

export default function App() {
  const [tab, setTab] = useState<Tab>('scores')
  const [hash, setHash] = useState(window.location.hash)
  const [teams, setTeams] = useState<Team[]>([])
  const [weeks, setWeeks] = useState<WeekInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [bets, setBets] = useState<Bet[]>([])
  const [bankroll, setBankroll] = useState<Bankroll | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [standingsKey, setStandingsKey] = useState(0)
  const [canEdit, setCanEdit] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])
  const current = weeks.find((w) => weekKey(w) === selected)
  const teamId = teamIdFromHash(hash)

  useEffect(() => {
    const onHash = () => {
      setHash(window.location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function goTab(next: Tab) {
    setTab(next)
    if (window.location.hash) {
      window.history.pushState(null, '', window.location.pathname + window.location.search)
      setHash('')
    }
  }

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
      setPassword('')
    } catch (err) {
      setLoginError(err instanceof UnauthorizedError ? 'Wrong password' : 'Could not reach the server')
    }
  }

  function lock() {
    setAdminPassword(null)
    setCanEdit(false)
  }

  const loadWeeks = useCallback(async () => {
    const w = await api.weeks()
    setWeeks(w)
    return w
  }, [])

  const loadBets = useCallback(async () => {
    const [b, br] = await Promise.all([api.bets(), api.bankroll()])
    setBets(b)
    setBankroll(br)
  }, [])

  // First load: teams, weeks, bets, then jump to the first week that still has unfinished games.
  useEffect(() => {
    Promise.all([api.teams(), loadWeeks(), loadBets()])
      .then(([t, w]) => {
        setTeams(t)
        const next = w.find((x) => x.final < x.total) ?? w[w.length - 1]
        if (next) setSelected(weekKey(next))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not reach the API'))
      .finally(() => setLoading(false))
  }, [loadWeeks, loadBets])

  useEffect(() => {
    if (!current) return
    api.games(current.seasonType, current.week).then(setGames).catch((e) => setError(String(e)))
  }, [current?.seasonType, current?.week]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSaved(saved: Game) {
    setGames((gs) => gs.map((g) => (g.id === saved.id ? saved : g)))
    setStandingsKey((k) => k + 1)
    await Promise.all([loadWeeks(), loadBets()]) // finishing a game settles its bets
  }

  async function refreshFromEspn() {
    setImporting(true)
    setError(null)
    try {
      await api.importSchedule()
      await Promise.all([loadWeeks(), loadBets()])
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
  const betsByGame = useMemo(() => {
    const m = new Map<number, Bet[]>()
    for (const b of bets) m.set(b.gameId, [...(m.get(b.gameId) ?? []), b])
    return m
  }, [bets])

  return (
    <div className="app">
      <header className="top">
        <h1>
          <a href="#/" onClick={() => goTab('scores')}>
            NFL 2026 Tracker
          </a>
        </h1>
        <nav className="tabs">
          {(['scores', 'standings', 'bets'] as Tab[]).map((t) => (
            <button key={t} className={tab === t && teamId === null ? 'active' : ''} onClick={() => goTab(t)}>
              {t === 'scores' ? 'Scores' : t === 'standings' ? 'Standings' : 'Bets'}
            </button>
          ))}
        </nav>
        {canEdit ? (
          <>
            <button className="secondary" onClick={refreshFromEspn} disabled={importing} title="Re-read the schedule and lines from ESPN. Games you've edited are not overwritten.">
              {importing ? 'Refreshing…' : 'Refresh schedule'}
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
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setUnlocking(false)
                setLoginError(null)
              }}
            >
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

      {!loading && teamId !== null && <TeamPage key={teamId} teamId={teamId} teams={teamMap} />}

      {!loading && teamId === null && tab === 'scores' && (
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
              <GameCard
                key={`${g.id}-${g.status}-${g.homeScore}-${g.awayScore}-${canEdit}`}
                game={g}
                teams={teamMap}
                teamList={teams}
                bets={betsByGame.get(g.id) ?? []}
                balanceCents={bankroll?.balanceCents ?? 0}
                onSaved={onSaved}
                onBetPlaced={loadBets}
                onUnauthorized={lock}
                canEdit={canEdit}
              />
            ))}
          </div>
        </>
      )}

      {!loading && teamId === null && tab === 'standings' && <Standings refreshKey={standingsKey} />}

      {!loading && teamId === null && tab === 'bets' && (
        <BetsPage bets={bets} bankroll={bankroll} teams={teamMap} canEdit={canEdit} onChanged={loadBets} onUnauthorized={lock} />
      )}
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
