import { useState } from 'react'
import { api, UnauthorizedError } from './api'
import type { Bet, BetSide, BetType, Game, Team } from './api'
import { describePick, hasLines, money, odds, profitCents, spread } from './format'

interface Props {
  game: Game
  home: Team | undefined
  away: Team | undefined
  bets: Bet[]
  teams: Map<number, Team>
  /** Admin unlocked: lines become clickable and a bet slip appears. */
  canBet: boolean
  balanceCents: number
  onPlaced: () => void
  onUnauthorized: () => void
}

interface Pick {
  type: BetType
  side: BetSide
  line: number | null
  odds: number
}

const QUICK_STAKES = [10, 25, 50, 100]

export function OddsBoard({ game, home, away, bets, teams, canBet, balanceCents, onPlaced, onUnauthorized }: Props) {
  const [pick, setPick] = useState<Pick | null>(null)
  const [stake, setStake] = useState('25')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!hasLines(game) && bets.length === 0) return null

  const open = game.status === 'Scheduled' && !!home && !!away
  const clickable = canBet && open

  const awaySpread = game.homeSpread === null ? null : -game.homeSpread + 0 // "+ 0" turns -0 into 0
  const cells: Record<string, Pick | null> = {
    awaySpread: game.homeSpread === null || game.awaySpreadOdds === null ? null : { type: 'Spread', side: 'Away', line: awaySpread, odds: game.awaySpreadOdds },
    homeSpread: game.homeSpread === null || game.homeSpreadOdds === null ? null : { type: 'Spread', side: 'Home', line: game.homeSpread, odds: game.homeSpreadOdds },
    over: game.total === null || game.overOdds === null ? null : { type: 'Total', side: 'Over', line: game.total, odds: game.overOdds },
    under: game.total === null || game.underOdds === null ? null : { type: 'Total', side: 'Under', line: game.total, odds: game.underOdds },
    awayMl: game.awayMoneyline === null ? null : { type: 'Moneyline', side: 'Away', line: null, odds: game.awayMoneyline },
    homeMl: game.homeMoneyline === null ? null : { type: 'Moneyline', side: 'Home', line: null, odds: game.homeMoneyline },
  }

  const stakeCents = Math.round((Number(stake) || 0) * 100)
  const win = pick ? profitCents(stakeCents, pick.odds) : 0
  const same = (a: Pick | null, b: Pick | null) => !!a && !!b && a.type === b.type && a.side === b.side

  function renderCell(id: string, main: string, sub: string) {
    const p = cells[id]
    if (!p) return <div className="odds-cell empty">–</div>
    const inner = (
      <>
        <span className="odds-main">{main}</span>
        <span className="odds-sub">{sub}</span>
      </>
    )
    if (!clickable) return <div className="odds-cell">{inner}</div>
    return (
      <button
        type="button"
        className={`odds-cell pickable ${same(pick, p) ? 'selected' : ''}`}
        onClick={() => {
          setPick(same(pick, p) ? null : p)
          setError(null)
        }}
      >
        {inner}
      </button>
    )
  }

  async function place() {
    if (!pick) return
    setBusy(true)
    setError(null)
    try {
      await api.placeBet({ gameId: game.id, type: pick.type, side: pick.side, stakeCents })
      setPick(null)
      onPlaced()
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized()
      setError(e instanceof UnauthorizedError ? 'Session locked. Unlock editing and try again.' : e instanceof Error ? e.message : 'Could not place bet')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="odds">
      {hasLines(game) && (
        <div className="odds-grid" role="table" aria-label="Betting lines">
          <div className="odds-head" />
          <div className="odds-head">Spread</div>
          <div className="odds-head">Total</div>
          <div className="odds-head">Money</div>

          <div className="odds-team">{away?.abbreviation ?? 'Away'}</div>
          {renderCell('awaySpread', spread(cells.awaySpread?.line ?? null), odds(game.awaySpreadOdds))}
          {renderCell('over', `O ${game.total}`, odds(game.overOdds))}
          {renderCell('awayMl', odds(game.awayMoneyline), '')}

          <div className="odds-team">{home?.abbreviation ?? 'Home'}</div>
          {renderCell('homeSpread', spread(game.homeSpread), odds(game.homeSpreadOdds))}
          {renderCell('under', `U ${game.total}`, odds(game.underOdds))}
          {renderCell('homeMl', odds(game.homeMoneyline), '')}
        </div>
      )}

      {hasLines(game) && game.oddsProvider && <div className="meta">Lines: {game.oddsProvider}</div>}

      {pick && (
        <div className="slip">
          <div className="slip-title">
            {describePick(pick, game, teams)} <span className="muted">({odds(pick.odds)})</span>
          </div>
          <div className="slip-row">
            <label className="stake">
              $
              <input type="number" min={1} inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} aria-label="Stake in dollars" />
            </label>
            {QUICK_STAKES.map((n) => (
              <button type="button" key={n} className="chip-btn" onClick={() => setStake(String(n))}>
                ${n}
              </button>
            ))}
          </div>
          <div className="slip-row">
            <span className="muted">
              To win {money(win)} · returns {money(stakeCents + win)}
            </span>
          </div>
          {stakeCents > balanceCents && <div className="error">Over your available bankroll ({money(balanceCents)}).</div>}
          {error && <div className="error">{error}</div>}
          <div className="actions">
            <button type="button" className="secondary" onClick={() => setPick(null)}>
              Cancel
            </button>
            <button type="button" className="primary" disabled={busy || stakeCents < 100 || stakeCents > balanceCents} onClick={place}>
              Place bet
            </button>
          </div>
        </div>
      )}

      {bets.length > 0 && (
        <ul className="my-bets">
          {bets.map((b) => (
            <li key={b.id} className={`bet-chip ${b.status}`}>
              {money(b.stakeCents)} {describePick(b, game, teams)} ({odds(b.americanOdds)})
              <strong>{b.status === 'Pending' ? 'Pending' : b.status === 'Push' ? 'Push' : money(b.netCents, true)}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
