import type { Bet, Game, Team } from './api'

export function money(cents: number, signed = false): string {
  const abs = Math.abs(cents) / 100
  const text = abs.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
  if (!signed) return cents < 0 ? `-${text}` : text
  return cents > 0 ? `+${text}` : cents < 0 ? `-${text}` : text
}

/** American odds with an explicit sign: +124, -110. */
export function odds(n: number | null): string {
  if (n === null) return '–'
  return n > 0 ? `+${n}` : String(n)
}

/** A point spread with an explicit sign: +2.5, -3, PK. */
export function spread(n: number | null): string {
  if (n === null) return '–'
  if (n === 0) return 'PK'
  return n > 0 ? `+${n}` : String(n)
}

/** Profit in cents on a winning bet. */
export function profitCents(stakeCents: number, americanOdds: number): number {
  return Math.round(stakeCents * (americanOdds > 0 ? americanOdds / 100 : 100 / -americanOdds))
}

/** "HOU +2.5", "JAX ML", "Over 42.5" */
export function describePick(bet: Pick<Bet, 'type' | 'side' | 'line'>, game: Game | undefined, teams: Map<number, Team>): string {
  if (bet.type === 'Total') return `${bet.side} ${bet.line}`
  const teamId = game ? (bet.side === 'Home' ? game.homeTeamId : game.awayTeamId) : null
  const abbr = teamId ? teams.get(teamId)?.abbreviation ?? bet.side : bet.side
  return bet.type === 'Moneyline' ? `${abbr} ML` : `${abbr} ${spread(bet.line)}`
}

export const kickoffFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

/** Game times come from the API as UTC without a trailing Z. */
export const asDate = (utc: string) => new Date(utc.endsWith('Z') ? utc : utc + 'Z')

/** True once a sportsbook has posted any line for the game. */
export function hasLines(g: Game): boolean {
  return g.homeSpread !== null || g.total !== null || g.homeMoneyline !== null || g.awayMoneyline !== null
}
