'use client';
// The counter card for printing: the business's active codes, signed by business-admin (the QR secret never
// reaches the browser), drawn here as a 1200 px PNG and an A6 PDF, the same card scripts/admin.ts prints.
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { parseQrPayload } from '../../../../supabase/functions/_shared/token.ts';
import type { CounterCode } from '../../../../supabase/functions/_shared/api-types.ts';
import { useDashboard } from '../../../components/Dashboard';
import { Loading, useLoad } from '../../../components/useLoad';
import { businessAdmin, fmtDate } from '../../../lib/api';
import { cardFooter, counterCardPdf, QR_PNG_OPTIONS } from '../../../lib/counterCard';

async function codes(businessId: string) {
  const r = await businessAdmin({ action: 'qr_list', businessId });
  if (r.status !== 'qr') throw new Error(r.status === 'forbidden' ? 'אין הרשאה' : 'לא ניתן לטעון את הקודים');
  return r;
}

function download(name: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

export default function QrPage() {
  const { business } = useDashboard();
  const { data, error, loading, reload } = useLoad(() => codes(business.id), [business.id]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await businessAdmin({ action: 'qr_create', businessId: business.id, label: label.trim() || undefined });
      setLabel('');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>קוד לקופה</h1>
        <p className="muted">מדפיסים את הכרטיס בגודל מקורי (100%) ומניחים אותו ליד הקופה. הלקוח סורק, והצוות מאשר בקוד על הטלפון של הלקוח.</p>
      </div>
      {loading && !data ? <Loading onRetry={reload} /> : error ? <Loading error={error} onRetry={reload} /> : null}
      {data && data.codes.length === 0 ? <p className="note">אין עדיין קוד פעיל לעסק. צרו אחד למטה.</p> : null}
      {data ? (
        <div className="grid2">
          {data.codes.map((c) => <CodeCard key={c.id} code={c} businessName={data.businessName} />)}
        </div>
      ) : null}
      <form className="card" onSubmit={create}>
        <h3>קוד נוסף</h3>
        <p className="muted small">לקופה נוספת או לסניף. כל הקודים של העסק צוברים לאותו כרטיס.</p>
        <label className="field">
          תווית (לא חובה)
          <span className="hint">למשל: קופה ראשית. מודפסת בקטן בתחתית הכרטיס, באותיות לטיניות בלבד.</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} dir="auto" />
        </label>
        <div><button className="btn" disabled={busy}>{busy ? 'יוצרים…' : 'יצירת קוד'}</button></div>
      </form>
    </div>
  );
}

function CodeCard({ code, businessName }: { code: CounterCode; businessName: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(code.payload, { ...QR_PNG_OPTIONS, width: 360 }).then(setPreview).catch(() => setPreview(null));
  }, [code.payload]);

  const png = async () => download(`perko-${code.id.slice(0, 8)}.png`, await QRCode.toDataURL(code.payload, QR_PNG_OPTIONS));
  const pdf = async () => {
    setBusy(true);
    try {
      const [heavy, regular] = await Promise.all(
        ['/fonts/Heebo_800ExtraBold.ttf', '/fonts/Heebo_400Regular.ttf'].map((u) => fetch(u).then((r) => r.arrayBuffer())),
      );
      const version = parseQrPayload(code.payload)?.version ?? 1;
      const bytes = await counterCardPdf(code.payload, businessName, cardFooter(code.id, version, code.label), { heavy, regular });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      download(`perko-${code.id.slice(0, 8)}.pdf`, url);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="hero" style={{ justifyItems: 'center' }}>
        {preview ? <img src={preview} alt={`קוד QR של ${businessName}`} width={180} height={180} style={{ borderRadius: 12 }} /> : <div style={{ height: 180 }} />}
      </div>
      <div>
        <strong>{code.label || 'קוד לקופה'}</strong>
        <div className="muted small">נוצר ב-{fmtDate(code.createdAt)}</div>
      </div>
      <div className="row">
        <button className="btn" onClick={pdf} disabled={busy}>{busy ? 'מכינים…' : 'כרטיס להדפסה (PDF)'}</button>
        <button className="btn quiet" onClick={png}>תמונה (PNG)</button>
      </div>
    </div>
  );
}
