'use client';
// Every stamp and redemption, with who confirmed it. Customers appear by first name, the last 4 digits of
// their phone or a masked email: never a full number or address.
import { useState } from 'react';
import { useDashboard } from '../../../components/Dashboard';
import { Loading, useLoad } from '../../../components/useLoad';
import { fmtDate, fmtTime, getLog } from '../../../lib/api';

const PERIODS = [7, 30, 90];

export default function LogPage() {
  const { business } = useDashboard();
  const [days, setDays] = useState(7);
  const { data, error, loading, reload } = useLoad(() => getLog(business.id, days), [business.id, days]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>יומן</h1>
        <p className="muted">חותמות והטבות שמומשו, מי אישר ומתי. השעות לפי שעון ישראל.</p>
      </div>
      <div className="seg" role="group" aria-label="תקופה">
        {PERIODS.map((d) => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d} ימים</button>)}
      </div>
      {loading && !data ? <Loading onRetry={reload} /> : error ? <Loading error={error} onRetry={reload} /> : null}
      {data && data.length === 0 ? <p className="note">אין פעולות ב-{days} הימים האחרונים.</p> : null}
      {data && data.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="muted small" style={{ textAlign: 'start', padding: 8 }}>{data.length} פעולות{data.length >= 500 ? ' (500 האחרונות)' : ''}</caption>
            <thead>
              <tr><th scope="col">תאריך</th><th scope="col">שעה</th><th scope="col">פעולה</th><th scope="col">אישר/ה</th><th scope="col">לקוח/ה</th></tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="num">{fmtDate(r.createdAt)}</td>
                  <td className="num">{fmtTime(r.createdAt)}</td>
                  <td>
                    {r.kind === 'redeem'
                      ? <><span className="tag lime">מימוש</span> {r.reward}</>
                      : <span className="tag">{r.amount === 1 ? 'חותמת' : `+${r.amount}`}</span>}
                  </td>
                  <td>{r.staffName}</td>
                  <td><bdi>{r.customer}</bdi></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
