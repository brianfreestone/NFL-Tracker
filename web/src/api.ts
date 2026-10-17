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

export class UnauthorizedError extends Error {
  constructor() {
    super("Wrong password")
  }
}

const STORAGE_KEY = "nfl-admin-password"

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
  if (password) headers.set("X-Admin-Password", password)
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text.replace(/^"|"$/g, "") || `Request failed (${res.status})`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  teams: () => request<Team[]>('/api/teams'),
  weeks: () => request<WeekInfo[]>('/api/weeks'),
  games: (seasonType: number, week: number) =>
    request<Game[]>(`/api/games?seasonType=${seasonType}&week=${week}`),
  updateGame: (id: number, update: GameUpdate) =>
    request<Game>(
      `/api/games/${id}`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) },
      getAdminPassword(),
    ),
  login: (password: string) => request<void>("/api/login", { method: "POST" }, password),
  standings: () => request<DivisionStandings[]>('/api/standings'),
  importSchedule: () =>
    request<{ teams: number; added: number; updated: number }>("/api/import", { method: "POST" }, getAdminPassword()),
}
