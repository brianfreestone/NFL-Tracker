import { useEffect, useState } from 'react'
import { api } from './api'
import type { Game, Team } from './api'
import { asDate, hasLines, odds, shortDate, spread } from './format'
import { TeamLink } from './TeamLink'
import { Record } from './teamInfo'

type Conf = 'AFC' | 'NFC'

/** How many games each conference plays in a round: Wild Card 3, Divisional 2, Conference Championship 1. */
const SLOTS: Record<number, number> = { 1: 3, 2: 2, 3: 1 }
const ROUND_NAME: Record<number, string> = { 1: 'Wild Card', 2: 'Divisional', 3: 'Conf. Champ', 4: 'Super Bowl' }

function conferenceOf(g: Game, teams: Map<number, Team>): Conf | null {
  // The teams are the truth; the round's label ("AFC Championship") is only a fallback for undecided games.
  for (const id of [g.homeTeamId, g.awayTeamId]) {
    const c = id ? teams.get(id)?.conference : undefined
    if (c === 'AFC' || c === 'NFC') return c
  }
  const label = g.label ?? ''
  if (label.includes('AFC')) return 'AFC'
  if (label.includes('NFC')) return 'NFC'
  return null
}

/**
 * Places a round's games into per-conference slots. Games whose teams are known go to their own
 * conference; undecided (TBD) games fill whatever slots are left, AFC first.
 */
function placeRound(games: Game[], week: number, teams: Map<number, Team>): Record<Conf, (Game | null)[]> {
  const size = SLOTS[week]
  const out: Record<Conf, (Game | null)[]> = { AFC: [], NFC: [] }
  const unknown: Game[] = []
  for (const g of games) {
    const c = conferenceOf(g, teams)
    if (c && out[c].length < size) out[c].push(g)
    else unknown.push(g)
  }
  for (const c of ['AFC', 'NFC'] as Conf[])
    while (out[c].length < size) out[c].push(unknown.shift() ?? null)
  return out
}

export function BracketPage({ teams, refreshKey, onOpenRound }: { teams: Map<number, Team>; refreshKey: number; onOpenRound: (week: number) => void }) {
  const [games, setGames] = useState<Game[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.postseason().then(setGames).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the playoffs'))
  }, [refreshKey])

  if (error) return <p className="error">{error}</p>
  if (!games) return <p className="muted">Loading…</p>
  if (games.length === 0) return <p className="muted">No postseason games yet.</p>

  const round = (week: number) => games.filter((g) => g.week === week)
  const wc = placeRound(round(1), 1, teams)
  const div = placeRound(round(2), 2, teams)
  const conf = placeRound(round(3), 3, teams)
  const superBowl = round(4)[0] ?? null

  const champion = superBowl && superBowl.status === 'Final'
    ? teams.get((superBowl.homeScore > superBowl.awayScore ? superBowl.homeTeamId : superBowl.awayTeamId) ?? -1)
    : undefined

  const column = (week: number, label: string, conference: string | null, matchups: (Game | null)[]) => (
    <div className="b-col" key={`${conference}-${week}`}>
      <button type="button" className="b-head" onClick={() => onOpenRound(week)} title={`Open ${ROUND_NAME[week]} in Scores`}>
        {conference && <span className="b-conf">{conference}</span>}
        {label}
      </button>
      <div className="b-body">
        {matchups.map((g, i) => (
          <Matchup key={g?.id ?? `empty-${i}`} game={g} teams={teams} />
        ))}
      </div>
    </div>
  )

  return (
    <section>
      {champion && (
        <div className="champion">
          <img src={champion.logoUrl} alt="" width={48} height={48} />
          <div>
            <span className="muted small">{superBowl?.label ?? 'Super Bowl'} champion</span>
            <strong>
              <TeamLink team={champion} />
            </strong>
          </div>
        </div>
      )}
      <div className="bracket-scroll">
        <div className="bracket">
          {column(1, 'Wild Card', 'AFC', wc.AFC)}
          {column(2, 'Divisional', 'AFC', div.AFC)}
          {column(3, 'Conf. Champ', 'AFC', conf.AFC)}
          {column(4, superBowl?.label ?? 'Super Bowl', null, [superBowl])}
          {column(3, 'Conf. Champ', 'NFC', conf.NFC)}
          {column(2, 'Divisional', 'NFC', div.NFC)}
          {column(1, 'Wild Card', 'NFC', wc.NFC)}
        </div>
      </div>
      <p className="muted small">Teams appear here as you set playoff matchups on the Scores tab (or after Refresh schedule). Tap a round title to open it.</p>
    </section>
  )
}

function Matchup({ game, teams }: { game: Game | null; teams: Map<number, Team> }) {
  if (!game) return <div className="matchup empty">TBD</div>

  const final = game.status === 'Final'
  const away = game.awayTeamId ? teams.get(game.awayTeamId) : undefined
  const home = game.homeTeamId ? teams.get(game.homeTeamId) : undefined
  const awayWon = final && game.awayScore > game.homeScore
  const homeWon = final && game.homeScore > game.awayScore
  const started = game.status !== 'Scheduled'

  return (
    <div className={`matchup ${final ? 'is-final' : ''}`}>
      <div className="m-meta">
        {final ? (game.overtime ? 'Final/OT' : 'Final') : game.status === 'InProgress' ? 'Live' : shortDate.format(asDate(game.kickoffUtc))}
      </div>
      <MatchRow team={away} score={game.awayScore} won={awayWon} lost={homeWon} started={started} />
      <MatchRow team={home} score={game.homeScore} won={homeWon} lost={awayWon} started={started} />
      {!final && hasLines(game) && home && away && (
        <div className="m-lines">
          {game.homeSpread !== null && `${home.abbreviation} ${spread(game.homeSpread)} (${odds(game.homeSpreadOdds)})`}
          {game.total !== null && ` · O/U ${game.total}`}
        </div>
      )}
    </div>
  )
}

function MatchRow({ team, score, won, lost, started }: { team: Team | undefined; score: number; won: boolean; lost: boolean; started: boolean }) {
  return (
    <div className={`m-row ${won ? 'won' : ''} ${lost ? 'lost' : ''}`}>
      {team ? <img src={team.logoUrl} alt="" width={22} height={22} /> : <span className="m-dot" />}
      <span className="m-name">
        {team ? <TeamLink team={team}>{team.abbreviation}</TeamLink> : 'TBD'} <Record teamId={team?.id} />
      </span>
      {started && <span className="m-score">{score}</span>}
    </div>
  )
}
