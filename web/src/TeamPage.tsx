import { useEffect, useState } from 'react'
import { api } from './api'
import type { Game, Team, TeamSchedule } from './api'
import { asDate, kickoffFormat, odds, spread } from './format'
import { TeamLink } from './TeamLink'

const POSTSEASON_ROUND: Record<number, string> = { 1: 'Wild Card', 2: 'Divisional', 3: 'Conf. Champ', 4: 'Super Bowl' }

interface Row {
  key: string
  label: string
  game?: Game
}

export function TeamPage({ teamId, teams }: { teamId: number; teams: Map<number, Team> }) {
  const [data, setData] = useState<TeamSchedule | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.teamSchedule(teamId).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load team'))
  }, [teamId])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const { team, record, games, byeWeeks } = data
  const regular = games.filter((g) => g.seasonType === 2)
  const rows: Row[] = []
  for (let week = 1; week <= 18; week++) {
    const game = regular.find((g) => g.week === week)
    if (game || byeWeeks.includes(week)) rows.push({ key: `r${week}`, label: `Week ${week}`, game })
  }
  for (const g of games.filter((g) => g.seasonType === 3))
    rows.push({ key: `p${g.id}`, label: POSTSEASON_ROUND[g.week] ?? g.label ?? 'Playoffs', game: g })

  return (
    <section>
      <a className="back" href="#/">
        ← All games
      </a>
      <header className="team-hero" style={{ borderColor: `#${team.color}` }}>
        <img src={team.logoUrl} alt="" width={72} height={72} />
        <div>
          <h2>{team.displayName}</h2>
          <div className="muted">{team.division}</div>
        </div>
        <div className="team-record">
          <strong>
            {record.wins}-{record.losses}
            {record.ties ? `-${record.ties}` : ''}
          </strong>
          <span className="muted">
            PF {record.pointsFor} · PA {record.pointsAgainst}
          </span>
        </div>
      </header>

      <ul className="schedule">
        {rows.map((r) => (
          <ScheduleRow key={r.key} row={r} teamId={team.id} teams={teams} />
        ))}
      </ul>
    </section>
  )
}

function ScheduleRow({ row, teamId, teams }: { row: Row; teamId: number; teams: Map<number, Team> }) {
  const g = row.game
  if (!g) {
    return (
      <li className="sched-row bye">
        <span className="sched-week">{row.label}</span>
        <span className="muted">BYE</span>
      </li>
    )
  }

  const isHome = g.homeTeamId === teamId
  const oppId = isHome ? g.awayTeamId : g.homeTeamId
  const opp = oppId ? teams.get(oppId) : undefined
  const mine = isHome ? g.homeScore : g.awayScore
  const theirs = isHome ? g.awayScore : g.homeScore

  let result: React.ReactNode
  let cls = ''
  if (g.status === 'Final') {
    const w = mine > theirs ? 'W' : mine < theirs ? 'L' : 'T'
    cls = w === 'W' ? 'win' : w === 'L' ? 'loss' : ''
    result = (
      <strong className={cls}>
        {w} {mine}–{theirs}
        {g.overtime ? ' (OT)' : ''}
      </strong>
    )
  } else if (g.status === 'InProgress') {
    result = (
      <strong className="live">
        Live {mine}–{theirs}
      </strong>
    )
  } else {
    // Spread from this team's point of view
    const mySpread = g.homeSpread === null ? null : isHome ? g.homeSpread : -g.homeSpread + 0
    result = (
      <span className="muted">
        {kickoffFormat.format(asDate(g.kickoffUtc))}
        {mySpread !== null && ` · ${spread(mySpread)} (${odds(isHome ? g.homeSpreadOdds : g.awaySpreadOdds)})`}
        {g.total !== null && ` · O/U ${g.total}`}
      </span>
    )
  }

  return (
    <li className="sched-row">
      <span className="sched-week">{row.label}</span>
      <span className="sched-opp">
        <span className="muted">{isHome ? 'vs' : '@'}</span>{' '}
        {opp ? (
          <>
            <img src={opp.logoUrl} alt="" width={22} height={22} /> <TeamLink team={opp} />
          </>
        ) : (
          'TBD'
        )}
      </span>
      <span className="sched-result">{result}</span>
    </li>
  )
}
