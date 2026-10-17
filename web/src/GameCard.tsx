import { useState } from 'react'
import { api } from './api'
import type { Game, GameStatus, Team } from './api'

interface Props {
  game: Game
  teams: Map<number, Team>
  teamList: Team[]
  onSaved: (game: Game) => void
}

const kickoffFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function GameCard({ game, teams, teamList, onSaved }: Props) {
  const [home, setHome] = useState(String(game.homeScore))
  const [away, setAway] = useState(String(game.awayScore))
  const [overtime, setOvertime] = useState(game.overtime)
  const [homeTeamId, setHomeTeamId] = useState(game.homeTeamId)
  const [awayTeamId, setAwayTeamId] = useState(game.awayTeamId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const final = game.status === 'Final'
  const homeTeam = homeTeamId ? teams.get(homeTeamId) : undefined
  const awayTeam = awayTeamId ? teams.get(awayTeamId) : undefined

  async function save(status: GameStatus) {
    setBusy(true)
    setError(null)
    try {
      const saved = await api.updateGame(game.id, {
        homeScore: Number(home) || 0,
        awayScore: Number(away) || 0,
        status,
        overtime,
        homeTeamId,
        awayTeamId,
      })
      onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const homeWon = final && game.homeScore > game.awayScore
  const awayWon = final && game.awayScore > game.homeScore
  const teamsSet = homeTeamId !== null && awayTeamId !== null

  return (
    <article className={`card ${final ? 'is-final' : ''}`}>
      <header className="card-head">
        <span>{kickoffFormat.format(new Date(game.kickoffUtc + 'Z'))}</span>
        <span className={`badge ${game.status}`}>
          {final ? (game.overtime ? 'Final/OT' : 'Final') : game.status === 'InProgress' ? 'In progress' : 'Scheduled'}
        </span>
      </header>

      <TeamRow
        role="Away"
        team={awayTeam}
        teamList={teamList}
        editableTeam={!final && game.awayTeamId === null}
        onPickTeam={setAwayTeamId}
        score={away}
        onScore={setAway}
        disabled={final || !teamsSet}
        won={awayWon}
      />
      <TeamRow
        role="Home"
        team={homeTeam}
        teamList={teamList}
        editableTeam={!final && game.homeTeamId === null}
        onPickTeam={setHomeTeamId}
        score={home}
        onScore={setHome}
        disabled={final || !teamsSet}
        won={homeWon}
      />

      {game.label && <div className="meta">{game.label}</div>}
      {game.venue && <div className="meta">{game.venue}</div>}

      {!final && (
        <label className="ot">
          <input type="checkbox" checked={overtime} onChange={(e) => setOvertime(e.target.checked)} disabled={!teamsSet} />
          Overtime
        </label>
      )}

      {error && <div className="error">{error}</div>}

      <div className="actions">
        {final ? (
          <button className="secondary" disabled={busy} onClick={() => save('InProgress')}>
            Edit score
          </button>
        ) : (
          <>
            <button className="secondary" disabled={busy || !teamsSet} onClick={() => save('InProgress')}>
              Save live score
            </button>
            <button className="primary" disabled={busy || !teamsSet} onClick={() => save('Final')}>
              Mark final
            </button>
          </>
        )}
      </div>
    </article>
  )
}

interface RowProps {
  role: string
  team: Team | undefined
  teamList: Team[]
  editableTeam: boolean
  onPickTeam: (id: number | null) => void
  score: string
  onScore: (v: string) => void
  disabled: boolean
  won: boolean
}

function TeamRow({ role, team, teamList, editableTeam, onPickTeam, score, onScore, disabled, won }: RowProps) {
  return (
    <div className={`team-row ${won ? 'won' : ''}`}>
      {team ? <img src={team.logoUrl} alt="" width={36} height={36} /> : <span className="logo-placeholder" />}
      {editableTeam || !team ? (
        <select value={team?.id ?? ''} onChange={(e) => onPickTeam(e.target.value ? Number(e.target.value) : null)} aria-label={`${role} team`}>
          <option value="">{role} team TBD</option>
          {teamList.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>
      ) : (
        <span className="team-name">{team.displayName}</span>
      )}
      <input
        className="score"
        type="number"
        min={0}
        inputMode="numeric"
        value={score}
        disabled={disabled}
        onChange={(e) => onScore(e.target.value)}
        onFocus={(e) => e.target.select()}
        aria-label={`${role} score`}
      />
    </div>
  )
}
