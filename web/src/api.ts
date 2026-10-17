export type GameStatus = 'Scheduled' | 'InProgress' | 'Final'

export interface Team {
  id: number
  abbreviation: string
  location: string
  name: string
  displayName: string
  color: string
  logoUrl: string
  conference: string
  division: string
}

export interface Game {
  id: number
  season: number
  seasonType: number
  week: number
  label: string | null
  kickoffUtc: string
  venue: string | null
  homeTeamId: number | null
  awayTeamId: number | null
  homeScore: number
  awayScore: number
  status: GameStatus
  overtime: boolean
  oddsProvider: string | null
  homeSpread: number | null
  homeSpreadOdds: number | null
  awaySpreadOdds: number | null
  total: number | null
  overOdds: number | null
  underOdds: number | null
  homeMoneyline: number | null
  awayMoneyline: number | null
}

export interface WeekInfo {
  seasonType: number
  week: number
  label: string | null
  total: number
  final: number
}

export interface StandingRow {
  teamId: number
  abbreviation: string
  name: string
  logoUrl: string
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  winPct: number
}

export interface DivisionStandings {
  division: string
  teams: StandingRow[]
}

export interface GameUpdate {
  homeScore: number
  awayScore: number
  status: GameStatus
  overtime: boolean
  homeTeamId?: number | null
  awayTeamId?: number | null
}

export type BetType = 'Moneyline' | 'Spread' | 'Total'
export type BetSide = 'Home' | 'Away' | 'Over' | 'Under'
export type BetStatus = 'Pending' | 'Won' | 'Lost' | 'Push'

export interface Bet {
  id: number
  gameId: number
  placedUtc: string
  type: BetType
  side: BetSide
  line: number | null
  americanOdds: number
  stakeCents: number
  status: BetStatus
  netCents: number
}

export interface Bankroll {
  startCents: number
  balanceCents: number
  atRiskCents: number
  netCents: number
  wins: number
  losses: number
  pushes: number
  pending: number
  roi: number
}

export interface TeamSchedule {
  team: Team
  record: { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number }
  games: Game[]
  byeWeeks: number[]
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Wrong password')
  }
}

const STORAGE_KEY = 'nfl-admin-password'

export function getAdminPassword(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setAdminPassword(password: string | null) {
  try {
    if (password) localStorage.setItem(STORAGE_KEY, password)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage unavailable (private window); editing just won't be remembered
  }
}

async function request<T>(url: string, init?: RequestInit, password?: string | null): Promise<T> {
  const headers = new Headers(init?.headers)
  if (password) headers.set('X-Admin-Password', password)
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text.replace(/^"|"$/g, '') || `Request failed (${res.status})`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  teams: () => request<Team[]>('/api/teams'),
  teamSchedule: (id: number) => request<TeamSchedule>(`/api/teams/${id}/schedule`),
  weeks: () => request<WeekInfo[]>('/api/weeks'),
  games: (seasonType: number, week: number) =>
    request<Game[]>(`/api/games?seasonType=${seasonType}&week=${week}`),
  gamesByIds: (ids: number[]) => request<Game[]>(`/api/games/lookup?ids=${ids.join(',')}`),
  updateGame: (id: number, update: GameUpdate) =>
    request<Game>(`/api/games/${id}`, json('PUT', update), getAdminPassword()),
  login: (password: string) => request<void>('/api/login', { method: 'POST' }, password),
  standings: () => request<DivisionStandings[]>('/api/standings'),
  importSchedule: () =>
    request<{ teams: number; added: number; updated: number }>('/api/import', { method: 'POST' }, getAdminPassword()),

  bets: () => request<Bet[]>('/api/bets'),
  bankroll: () => request<Bankroll>('/api/bankroll'),
  placeBet: (bet: { gameId: number; type: BetType; side: BetSide; stakeCents: number }) =>
    request<Bet>('/api/bets', json('POST', bet), getAdminPassword()),
  cancelBet: (id: number) => request<void>(`/api/bets/${id}`, { method: 'DELETE' }, getAdminPassword()),
  resetBets: () => request<void>('/api/bets/reset', { method: 'POST' }, getAdminPassword()),
}
