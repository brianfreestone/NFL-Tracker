import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { GameRef, Team } from './api'
import { asDate, odds, shortDate, spread } from './format'
import { ordinal, recordText, useTeamSummary } from './teamInfo'

const CARD_WIDTH = 310
const CARD_HEIGHT = 210 // rough; only used to decide whether to open above or below

/** Links to a team's schedule page and shows a hover card. Plain text for undecided (TBD) slots. */
export function TeamLink({ team, children }: { team: Team | undefined; children?: ReactNode }) {
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (!team) return <>{children ?? 'TBD'}</>

  function show(e: React.SyntheticEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const above = r.bottom + 8 + CARD_HEIGHT > window.innerHeight && r.top > CARD_HEIGHT
      const left = Math.max(8, Math.min(r.left, window.innerWidth - CARD_WIDTH - 8))
      setPos({ left, top: above ? r.top - 8 : r.bottom + 8, above })
    }, 150)
  }

  function hide() {
    window.clearTimeout(timer.current)
    setPos(null)
  }

  return (
    <>
      <a className="team-link" href={`#/team/${team.id}`} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={hide}>
        {children ?? team.displayName}
      </a>
      {pos && <TeamCard team={team} pos={pos} />}
    </>
  )
}

function TeamCard({ team, pos }: { team: Team; pos: { left: number; top: number; above: boolean } }) {
  const s = useTeamSummary(team.id)

  return createPortal(
    <div
      className="team-card"
      role="tooltip"
      style={{ left: pos.left, top: pos.top, width: CARD_WIDTH, transform: pos.above ? 'translateY(-100%)' : undefined, borderTopColor: `#${team.color}` }}
    >
      <div className="tc-head">
        <img src={team.logoUrl} alt="" width={40} height={40} />
        <div>
          <strong>{team.displayName}</strong>
          <div className="muted small">
            {team.division}
            {s && s.gamesPlayed > 0 && ` · ${ordinal(s.divisionRank)}`}
          </div>
        </div>
        {s && <span className="tc-record">{recordText(s)}</span>}
      </div>

      {s && s.gamesPlayed > 0 ? (
        <>
          <div className="tc-line">
            Home {s.homeRecord} · Away {s.awayRecord} · Div {s.divisionRecord}
          </div>
          <div className="tc-line">
            PF {s.pointsFor} · PA {s.pointsAgainst} ({s.pointsFor - s.pointsAgainst >= 0 ? '+' : ''}
            {s.pointsFor - s.pointsAgainst}){s.streak && ` · Streak ${s.streak}`}
          </div>
        </>
      ) : (
        <div className="tc-line muted">No games played yet</div>
      )}

      {s?.last && (
        <div className="tc-line">
          <span className="tc-label">Last</span> <Result g={s.last} />
        </div>
      )}
      {s?.next && (
        <div className="tc-line">
          <span className="tc-label">{s.next.status === 'InProgress' ? 'Now' : 'Next'}</span> <Upcoming g={s.next} />
        </div>
      )}
      <div className="tc-hint muted small">Click for the full schedule</div>
    </div>,
    document.body,
  )
}

function Result({ g }: { g: GameRef }) {
  const w = g.ownScore > g.oppScore ? 'W' : g.ownScore < g.oppScore ? 'L' : 'T'
  return (
    <>
      <strong className={w === 'W' ? 'win' : w === 'L' ? 'loss' : ''}>
        {w} {g.ownScore}–{g.oppScore}
      </strong>{' '}
      {g.home ? 'vs' : '@'} {g.opponentAbbr}
      {g.overtime ? ' (OT)' : ''}
    </>
  )
}

function Upcoming({ g }: { g: GameRef }) {
  const vs = `${g.home ? 'vs' : '@'} ${g.opponentAbbr}`
  if (g.status === 'InProgress')
    return (
      <>
        {vs} · <strong className="live">{g.ownScore}–{g.oppScore}</strong>
      </>
    )
  return (
    <>
      {vs} · {shortDate.format(asDate(g.kickoffUtc))}
      {g.spread !== null && ` · ${spread(g.spread)} (${odds(g.spreadOdds)})`}
      {g.total !== null && ` · O/U ${g.total}`}
    </>
  )
}
