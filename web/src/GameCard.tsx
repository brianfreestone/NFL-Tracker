import { useState } from 'react'
import { api, UnauthorizedError } from './api'
import type { Bet, Game, GameStatus, Team } from './api'
import { kickoffFormat, asDate } from './format'
import { OddsBoard } from './OddsBoard'
import { Record } from './teamInfo'
import { TeamLink } from './TeamLink'

interface Props {
  game: Game
  teams: Map<number, Team>
  teamList: Team[]
  bets: Bet[]
  balanceCents: number
  onSaved: (game: Game) => void
  onBetPlaced: () => void
  canEdit: boolean
  onUnauthorized: () => void
}

export function GameCard({ game, teams, teamList, bets, balanceCents, onSaved, onBetPlaced, canEdit, onUnauthorized }: Props) {
  const [home, setHome] = useState(String(game.homeScore))
  const [away, setAway] = useState(String(game.awayScore))
  const [overtime, setOvertime] = useState(game.overtime)
  const [homeTeamId, setHomeTeamId] = useState(game.homeTeamId)
  const [awayTeamId, setAwayTeamId] = useState(game.awayTeamId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const final = game.status === 'Final'
  const readOnly = !canEdit
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
      if (e instanceof UnauthorizedError) onUnauthorized()
      setError(e instanceof UnauthorizedError ? 'Session locked. Unlock editing and try again.' : e instanceof Error ? e.message : 'Save failed')
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
        <span>{kickoffFormat.format(asDate(game.kickoffUtc))}</span>
        <span className={`badge ${game.status}`}>
          {final ? (game.overtime ? 'Final/OT' : 'Final') : game.status === 'InProgress' ? 'In progress' : 'Scheduled'}
        </span>
      </header>

      <TeamRow
        role="Away"
        team={awayTeam}
        teamList={teamList}
        editableTeam={canEdit && !final && game.awayTeamId === null}
        onPickTeam={setAwayTeamId}
        score={away}
        onScore={setAway}
        disabled={readOnly || final || !teamsSet}
        won={awayWon}
      />
      <TeamRow
        role="Home"
        team={homeTeam}
        teamList={teamList}
        editableTeam={canEdit && !final && game.homeTeamId === null}
        onPickTeam={setHomeTeamId}
        score={home}
        onScore={setHome}
        disabled={readOnly || final || !teamsSet}
        won={homeWon}
      />

      <OddsBoard
        game={game}
        home={homeTeam}
        away={awayTeam}
        bets={bets}
        teams={teams}
        canBet={canEdit}
        balanceCents={balanceCents}
        onPlaced={onBetPlaced}
        onUnauthorized={onUnauthorized}
      />

      {game.label && <div className="meta">{game.label}</div>}
      {game.venue && <div className="meta">{game.venue}</div>}

      {canEdit && !final && (
        <label className="ot">
          <input type="checkbox" checked={overtime} onChange={(e) => setOvertime(e.target.checked)} disabled={!teamsSet} />
          Overtime
        </label>
      )}

      {error && <div className="error">{error}</div>}

      {canEdit && (
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
      )}
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
      {team ? (
        <TeamLink team={team}>
          <img src={team.logoUrl} alt="" width={36} height={36} />
        </TeamLink>
      ) : (
        <span className="logo-placeholder" />
      )}
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
        <span className="team-name">
          <span className="tn-text">
            <TeamLink team={team} />
          </span>
          <Record teamId={team.id} />
        </span>
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
