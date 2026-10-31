'use client';
// The running program. Edited in place under RLS: open cards keep the rules they were opened with (each card
// stores its own goal, step, reward and rule texts), so changes reach new cards only. The cooldown is the
// exception: it is read live and applies at once.
import { useEffect, useState, type FormEvent } from 'react';
import { useDashboard } from '../../../components/Dashboard';
import { Loading, useLoad } from '../../../components/useLoad';
import { getProgram, saveProgram, type Program } from '../../../lib/api';

const COOLDOWNS = [
  { v: 0, label: 'בלי המתנה' },
  { v: 30, label: 'חצי שעה' },
  { v: 60, label: 'שעה' },
  { v: 120, label: 'שעתיים' },
  { v: 240, label: '4 שעות' },
  { v: 720, label: '12 שעות' },
  { v: 1440, label: 'יום' },
];

export default function ProgramPage() {
  const { business } = useDashboard();
  const { data, error, loading, reload } = useLoad(() => getProgram(business.id), [business.id]);
  const [form, setForm] = useState<Program | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the form starts from the loaded program
    if (data) setForm(data);
  }, [data]);

  if (loading && !form) return <Loading onRetry={reload} />;
  if (error) return <Loading error={error} onRetry={reload} />;
  if (!data || !form) return <p className="note">אין לעסק תוכנית פעילה. כתבו לנו ל-hello@getperko.com.</p>;

  const set = <K extends keyof Program>(k: K, v: Program[K]) => setForm({ ...form, [k]: v });
  const invalid =
    !form.name.trim() || !form.reward.trim() || !form.rule.trim() || !form.redeemRule.trim() ||
    !(form.goal >= 1 && form.goal <= 100000) || (form.type === 'points' && !(form.step >= 1 && form.step <= form.goal));
  const cooldowns = COOLDOWNS.some((c) => c.v === form.cooldownMinutes) ? COOLDOWNS : [...COOLDOWNS, { v: form.cooldownMinutes, label: `${form.cooldownMinutes} דקות` }];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveProgram(form);
      setMessage('נשמר. כרטיסים חדשים יקבלו את הכללים החדשים; זמן ההמתנה חל מעכשיו.');
      await reload();
    } catch (err) {
      setMessage(`לא נשמר: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const unit = form.type === 'points' ? 'נקודות' : 'חותמות';
  return (
    <form className="page" onSubmit={submit}>
      <div className="page-head">
        <h1>התוכנית</h1>
        <p className="muted">מה הלקוחות צוברים ומה הם מקבלים.</p>
      </div>
      <p className="note warn">שינויים חלים על כרטיסים חדשים בלבד. מי שכבר מחזיק כרטיס ממשיך בכללים שהיו כשפתח אותו, עד שיממש.</p>

      <div className="hero" aria-live="polite">
        <span className="small">{business.name} · {form.name || 'בלי שם'}</span>
        <h2>{form.reward || 'ההטבה'}</h2>
        <p>אחרי {form.goal} {unit}{form.type === 'points' ? `, ${form.step} על כל רכישה מזכה` : ''}.</p>
      </div>

      <div className="card">
        <h3>צבירה</h3>
        <label className="field">
          שם הכרטיס
          <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={40} required />
        </label>
        <div className="field" role="group" aria-label="סוג הצבירה">
          <strong className="small">סוג</strong>
          <div className="seg">
            <button type="button" aria-pressed={form.type === 'stamps'} onClick={() => setForm({ ...form, type: 'stamps', step: 1 })}>חותמות</button>
            <button type="button" aria-pressed={form.type === 'points'} onClick={() => set('type', 'points')}>נקודות</button>
          </div>
        </div>
        <div className="grid2">
          <label className="field">
            {form.type === 'points' ? 'נקודות להטבה' : 'חותמות להטבה'}
            <input type="number" inputMode="numeric" min={1} max={100000} value={form.goal} onChange={(e) => set('goal', Number(e.target.value))} required />
          </label>
          {form.type === 'points' ? (
            <label className="field">
              נקודות לכל רכישה מזכה
              <input type="number" inputMode="numeric" min={1} max={form.goal} value={form.step} onChange={(e) => set('step', Number(e.target.value))} required />
            </label>
          ) : null}
        </div>
        <label className="field">
          כלל הצבירה
          <span className="hint">מה נחשב רכישה מזכה, כפי שיופיע באפליקציה. למשל: חותמת על כל משקה חם</span>
          <input value={form.rule} onChange={(e) => set('rule', e.target.value)} maxLength={120} required />
        </label>
        <label className="field">
          זמן המתנה בין חותמות
          <span className="hint">לקוח לא יוכל לצבור שוב בעסק לפני שעבר הזמן הזה. חל מיד, גם על כרטיסים פתוחים.</span>
          <select value={form.cooldownMinutes} onChange={(e) => set('cooldownMinutes', Number(e.target.value))}>
            {cooldowns.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        </label>
      </div>

      <div className="card">
        <h3>הטבה</h3>
        <label className="field">
          ההטבה
          <input value={form.reward} onChange={(e) => set('reward', e.target.value)} maxLength={60} required />
        </label>
        <label className="field">
          כלל המימוש
          <span className="hint">איך ומתי מממשים. למשל: בקופה, מול הצוות</span>
          <input value={form.redeemRule} onChange={(e) => set('redeemRule', e.target.value)} maxLength={120} required />
        </label>
      </div>

      {message ? <p className="note" role="status">{message}</p> : null}
      <div className="row">
        <button className="btn" disabled={saving || invalid}>{saving ? 'שומרים…' : 'שמירה'}</button>
        <button type="button" className="btn quiet" onClick={() => { setForm(data); setMessage(null); }}>ביטול שינויים</button>
      </div>
    </form>
  );
}
