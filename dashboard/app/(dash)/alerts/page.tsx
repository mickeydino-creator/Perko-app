'use client';
// PIN alerts: a customer locked out after too many wrong PINs, or many wrong PINs within an hour.
import { useEffect } from 'react';
import { useDashboard } from '../../../components/Dashboard';
import { Loading, useLoad } from '../../../components/useLoad';
import { fmtDate, fmtTime, getAlerts, markAlertsSeen, type Alert } from '../../../lib/api';

export default function AlertsPage() {
  const { business } = useDashboard();
  const { data, error, loading, reload } = useLoad(() => getAlerts(business.id), [business.id]);

  // Opening the page marks the alerts seen (the badge in the menu goes away on the next visit).
  useEffect(() => {
    if (data?.some((a) => !a.seenAt)) markAlertsSeen(business.id).catch(() => undefined);
  }, [data, business.id]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>התראות</h1>
        <p className="muted">לקוח שהוקלדו בטלפון שלו 3 קודים שגויים ברצף נחסם בעסק עד סוף היום. כאן רואים כל חסימה כזו.</p>
      </div>
      {loading && !data ? <Loading onRetry={reload} /> : error ? <Loading error={error} onRetry={reload} /> : null}
      {data && data.length === 0 ? <p className="note">אין התראות. הכל שקט.</p> : null}
      {data && data.length > 0 ? (
        <ul className="list">
          {data.map((a) => (
            <li key={a.id}>
              <div className="grow">
                <strong>{title(a)}</strong>
                <div className="muted small">{advice(a)}</div>
              </div>
              {!a.seenAt ? <span className="tag lime">חדש</span> : null}
              <span className="muted small num">{fmtDate(a.createdAt)} {fmtTime(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function title(a: Alert): string {
  if (a.kind === 'pin_lockout') return `${a.customer ?? 'לקוח/ה'} נחסם/ה עד סוף היום אחרי ${a.failures ?? 3} קודים שגויים`;
  return `${a.failures ?? 10} קודים שגויים בשעה אחת, מלקוחות שונים`;
}

function advice(a: Alert): string {
  if (a.kind === 'pin_lockout') return 'אם זו הייתה טעות הקלדה של הצוות, הלקוח יוכל לצבור שוב מחר. אם לא, ייתכן שמישהו ניסה לנחש את הקוד.';
  return 'ייתכן שמישהו מנסה לנחש את הקוד. מומלץ להחליף את הקוד בעמוד ״צוות״.';
}
