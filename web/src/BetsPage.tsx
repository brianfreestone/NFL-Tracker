import { useEffect, useState } from 'react'
import { api, UnauthorizedError } from './api'
import type { Bankroll, Bet, Game, Team } from './api'
import { describePick, money, odds, profitCents, shortDate, asDate } from './format'
import { TeamLink } from './TeamLink'

interface Props {
  bets: Bet[]
  bankroll: Bankroll | null
  teams: Map<number, Team>
  canEdit: boolean
  onChanged: () => void
  onUnauthorized: () => void
}

export function BetsPage({ bets, bankroll, teams, canEdit, onChanged, onUnauthorized }: Props) {
  const [games, setGames] = useState<Map<number, Game>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const gameIds = [...new Set(bets.map((b) => b.gameId))].sort().join(',')

  // Each bet needs its game (teams, score).
  useEffect(() => {
    if (!gameIds) return
    let cancelled = false
    api
      .gamesByIds(gameIds.split(',').map(Number))
      .then((list) => {
        if (!cancelled) setGames(new Map(list.map((g) => [g.id, g])))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [gameIds, bankroll?.netCents])

  async function run(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
      onChanged()
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized()
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  return (
    <section>
      <p className="muted play-note">Play money only. Lines come from DraftKings via ESPN. Pick a spread, total, or moneyline on any scheduled game while unlocked.</p>

      {bankroll && (
        <div className="tiles">
          <Tile label="Available" value={money(bankroll.balanceCents)} big />
          <Tile label="At risk" value={money(bankroll.atRiskCents)} sub={`${bankroll.pending} pending`} />
          <Tile label="Net P/L" value={money(bankroll.netCents, true)} tone={bankroll.netCents > 0 ? 'good' : bankroll.netCents < 0 ? 'bad' : undefined} />
          <Tile label="Record" value={`${bankroll.wins}-${bankroll.losses}-${bankroll.pushes}`} sub="W-L-P" />
          <Tile label="ROI" value={`${(bankroll.roi * 100).toFixed(1)}%`} tone={bankroll.roi > 0 ? 'good' : bankroll.roi < 0 ? 'bad' : undefined} />
        </div>
      )}

      {canEdit && bets.length > 0 && (
        <div className="actions left">
          <button
            className="secondary"
            onClick={() => {
              if (window.confirm('Delete every bet and reset the bankroll to $1,000?')) run(() => api.resetBets())
            }}
          >
            Reset bankroll
          </button>
        </div>
      )}
      {error && <div className="error banner">{error}</div>}

      {bets.length === 0 ? (
        <p className="muted">No bets yet. Unlock editing, then tap a line on any scheduled game on the Scores tab.</p>
      ) : (
        <ul className="bet-list">
          {bets.map((b) => {
            const g = games.get(b.gameId)
            const home = g?.homeTeamId ? teams.get(g.homeTeamId) : undefined
            const away = g?.awayTeamId ? teams.get(g.awayTeamId) : undefined
            return (
              <li key={b.id} className={`bet-row ${b.status}`}>
                <div className="bet-main">
                  <strong>{describePick(b, g, teams)}</strong> <span className="muted">({odds(b.americanOdds)})</span>
                  <div className="muted small">
                    <TeamLink team={away}>{away?.abbreviation ?? '…'}</TeamLink> @ <TeamLink team={home}>{home?.abbreviation ?? '…'}</TeamLink>
                    {g && g.status !== 'Scheduled' && ` · ${g.awayScore}–${g.homeScore}${g.status === 'Final' ? ' F' : ' live'}`}
                    {' · '}placed {shortDate.format(asDate(b.placedUtc))}
                  </div>
                </div>
                <div className="bet-money">
                  <div>{money(b.stakeCents)}</div>
                  <div className="muted small">
                    {b.status === 'Pending' ? `wins ${money(profitCents(b.stakeCents, b.americanOdds))}` : ''}
                  </div>
                </div>
                <div className={`pill ${b.status}`}>{b.status === 'Pending' ? 'Pending' : b.status === 'Push' ? 'Push' : `${b.status} ${money(b.netCents, true)}`}</div>
                {canEdit && b.status === 'Pending' && (
                  <button className="secondary tiny" onClick={() => run(() => api.cancelBet(b.id))} title="Cancel this bet and refund the stake">
                    Cancel
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Tile({ label, value, sub, tone, big }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad'; big?: boolean }) {
  return (
    <div className={`tile ${big ? 'big' : ''} ${tone ?? ''}`}>
      <span className="tile-label">{label}</span>
      <strong>{value}</strong>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  )
}
