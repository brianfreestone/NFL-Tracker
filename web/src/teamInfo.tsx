import { createContext, useContext } from 'react'
import type { TeamSummary } from './api'

/** Per-team records and recent/upcoming games, loaded once by App and shared with every team label. */
export const TeamInfoContext = createContext<Map<number, TeamSummary>>(new Map())

export function useTeamSummary(teamId: number | null | undefined): TeamSummary | undefined {
  const all = useContext(TeamInfoContext)
  return teamId ? all.get(teamId) : undefined
}

export function recordText(s: TeamSummary | undefined): string {
  if (!s) return ''
  return s.ties > 0 ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th']
export const ordinal = (n: number) => ORDINAL[n] ?? `${n}th`

/** A team's regular-season record, e.g. "3-2". Renders nothing until the data arrives. */
export function Record({ teamId, className = 'rec' }: { teamId: number | null | undefined; className?: string }) {
  const s = useTeamSummary(teamId)
  return s ? <span className={className}>{recordText(s)}</span> : null
}
