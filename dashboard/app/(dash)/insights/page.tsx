'use client';
// Insights for the last 7 and 30 days, from business_insights() (counts in Israel days).
import { useDashboard } from '../../../components/Dashboard';
import { Loading, useLoad } from '../../../components/useLoad';
import { getInsights, type Insights } from '../../../lib/api';

export default function InsightsPage() {
  const { business } = useDashboard();
  const { data, error, loading, reload } = useLoad(
    async () => Promise.all([getInsights(business.id, 7), getInsights(business.id, 30)]),
    [business.id],
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>תובנות</h1>
        <p className="muted">ביקור הוא צבירה אחת בקופה. לקוח חוזר ביקר בשני ימים שונים לפחות בתקופה.</p>
      </div>
      {loading && !data ? <Loading onRetry={reload} /> : error ? <Loading error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Period title="7 הימים האחרונים" i={data[0]} />
          <Period title="30 הימים האחרונים" i={data[1]} />
        </>
      ) : null}
    </div>
  );
}

function Period({ title, i }: { title: string; i: Insights }) {
  const share = i.activeCustomers ? Math.round((i.returningCustomers / i.activeCustomers) * 100) : 0;
  return (
    <section className="card" aria-label={title}>
      <h2>{title}</h2>
      <div className="stats">
        <Stat label="לקוחות פעילים" value={i.activeCustomers} />
        <Stat label="לקוחות חוזרים" value={i.returningCustomers} sub={i.activeCustomers ? `${share}% מהפעילים` : undefined} />
        <Stat label="הטבות שמומשו" value={i.rewardsRedeemed} />
        <Stat label="ביקורים" value={i.visits} />
        <Stat label="ביקורים ללקוח" value={i.visitsPerCustomer.toLocaleString('he-IL', { maximumFractionDigits: 1 })} sub="בממוצע" />
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <b>{value}</b>
      {sub ? <span className="muted small">{sub}</span> : null}
    </div>
  );
}
