import { useEffect, useState } from 'react'
import { api } from './api'
import type { DivisionStandings } from './api'

export function Standings({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<DivisionStandings[] | null>(null)

  useEffect(() => {
    api.standings().then(setData).catch(() => setData([]))
  }, [refreshKey])

  if (!data) return <p className="muted">Loading standings…</p>

  return (
    <div className="standings">
      {data.map((d) => (
        <section key={d.division} className="division">
          <h3>{d.division}</h3>
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
                <th>T</th>
                <th>PF</th>
                <th>PA</th>
              </tr>
            </thead>
            <tbody>
              {d.teams.map((t) => (
                <tr key={t.teamId}>
                  <td>
                    <img src={t.logoUrl} alt="" width={22} height={22} /> {t.name}
                  </td>
                  <td>{t.wins}</td>
                  <td>{t.losses}</td>
                  <td>{t.ties}</td>
                  <td>{t.pointsFor}</td>
                  <td>{t.pointsAgainst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
