'use client';
// Owners sign in with a one-time code sent by email, as in the app. Only addresses added with
// `npm run admin -- owners:add` can sign in: the dashboard never creates accounts.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { normalizeEmail } from '../../../supabase/functions/_shared/loyalty.ts';
import { configured, sb } from '../../lib/supabase';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized) return setError('זו לא כתובת מייל תקינה.');
    setBusy(true);
    setError(null);
    const { error } = await sb().auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: false } });
    setBusy(false);
    // An unknown address gets the same answer, so the page does not reveal who is an owner.
    if (error && !/signups not allowed|not found|otp_disabled/i.test(error.message)) return setError('לא הצלחנו לשלוח קוד. נסו שוב בעוד רגע.');
    setSent(normalized);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6,10}$/.test(code.trim())) return setError('הקוד הוא 6 ספרות מהמייל.');
    setBusy(true);
    setError(null);
    const { error } = await sb().auth.verifyOtp({ email: sent!, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) return setError('הקוד שגוי או שפג תוקפו. אפשר לבקש קוד חדש.');
    router.replace('/program');
  };

  return (
    <main className="center">
      <div className="login" style={{ display: 'grid', gap: 18 }}>
        <div className="hero">
          <span className="wordmark">perk<i /></span>
          <h1>Perko לעסקים</h1>
          <p>התוכנית, הצוות, היומן והקוד לקופה של העסק שלכם.</p>
        </div>
        {!configured ? (
          <p className="note warn">חסרים משתני הסביבה NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY.</p>
        ) : sent ? (
          <form className="card" onSubmit={verify}>
            <h2>הקוד נשלח</h2>
            <p className="muted">אם {sent} רשומה כבעלים של עסק, נשלח אליה קוד חד-פעמי.</p>
            <label className="field">
              קוד מהמייל
              <input
                inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} autoFocus
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-invalid={!!error}
              />
            </label>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <div className="row">
              <button className="btn" disabled={busy}>{busy ? 'בודקים…' : 'כניסה'}</button>
              <button type="button" className="btn quiet" onClick={() => { setSent(null); setCode(''); setError(null); }}>כתובת אחרת</button>
            </div>
          </form>
        ) : (
          <form className="card" onSubmit={send}>
            <h2>כניסה</h2>
            <label className="field">
              אימייל
              <input type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} autoFocus />
            </label>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <button className="btn" disabled={busy}>{busy ? 'שולחים…' : 'שליחת קוד'}</button>
            <p className="muted small">הכניסה פתוחה לבעלי עסקים שהצטרפו ל-Perko. רוצים להצטרף? <a href="https://www.getperko.com">getperko.com</a></p>
          </form>
        )}
      </div>
    </main>
  );
}
