import type { ReactNode } from 'react'
import type { Team } from './api'

/** Links to a team's schedule page. Falls back to plain text when the team isn't known yet (TBD playoff slots). */
export function TeamLink({ team, children }: { team: Team | undefined; children?: ReactNode }) {
  if (!team) return <>{children ?? 'TBD'}</>
  return (
    <a className="team-link" href={`#/team/${team.id}`}>
      {children ?? team.displayName}
    </a>
  )
}
