// The printable counter card: an A6 PDF (lime, wordmark, business name, vector QR, short instructions) and the
// options for a 1200 px PNG of the code. Shared by the owner dashboard (in the browser) and scripts/admin.ts
// (qr:create / qr:print, in Node), so a card looks the same whoever prints it. Fonts are passed in as bytes:
// the dashboard fetches them from /fonts, the script reads them from node_modules.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

export type CardFonts = { heavy: Uint8Array | ArrayBuffer; regular: Uint8Array | ArrayBuffer };

/** For QRCode.toFile / toDataURL: large, quiet zone, medium error correction, brand ink on white. */
export const QR_PNG_OPTIONS = { width: 1200, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#11130F', light: '#FFFFFF' } } as const;

const LIME = rgb(0xd7 / 255, 0xff / 255, 0x35 / 255);
const INK = rgb(0x11 / 255, 0x13 / 255, 0x0f / 255);
const MUTED = rgb(0x30 / 255, 0x36 / 255, 0x26 / 255);
const WHITE = rgb(1, 1, 1);

/**
 * A6 counter card, 105 x 148 mm. `footer` is printed small at the bottom left (label, code id, key version),
 * ASCII only. Print at 100% scale.
 */
export async function counterCardPdf(payload: string, businessName: string, footer: string, fonts: CardFonts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const heavy = await pdf.embedFont(fonts.heavy, { subset: true });
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const W = 297.6, H = 419.5, M = 24;
  const page = pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: LIME });

  // Wordmark: "perk" (Heebo 800, tracking -0.055em, letter by letter) + a solid disc as the "o".
  const wm = 30;
  const base = H - M - wm * 0.8;
  let x = M;
  for (const ch of 'perk') {
    page.drawText(ch, { x, y: base, size: wm, font: heavy, color: INK });
    x += heavy.widthOfTextAtSize(ch, wm) - 0.055 * wm;
  }
  page.drawCircle({ x: x + 0.035 * wm + 0.25 * wm, y: base + 0.25 * wm, size: 0.25 * wm, color: INK });

  // fontkit shapes Hebrew right to left itself: pass logical order, align to the right margin.
  const right = (text: string, y: number, size: number, font = heavy, color = INK) =>
    page.drawText(text, { x: W - M - font.widthOfTextAtSize(text, size), y, size, font, color });
  right(businessName, H - 104, 24);
  right('סורקים כאן אחרי רכישה מזכה', H - 126, 13, regular, MUTED);

  // QR on a white rounded tile, drawn as vector modules.
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const tile = 204;
  const tileX = (W - tile) / 2;
  const tileY = 74;
  page.drawRectangle({ x: tileX, y: tileY, width: tile, height: tile, color: WHITE });
  const pad = 14;
  const cell = (tile - 2 * pad) / n;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c)) page.drawRectangle({ x: tileX + pad + c * cell, y: tileY + tile - pad - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: INK });

  right('אחרי הסריקה, הצוות מאשר בקוד על הטלפון.', 52, 11, regular, INK);
  right('כללי הצבירה וההטבה נקבעים על ידי העסק.', 39, 9, regular, MUTED);
  page.drawText(footer.replace(/[^\x20-\x7E·]/g, ''), { x: M, y: 18, size: 7, font: regular, color: MUTED });

  return pdf.save();
}

/** The small print at the bottom of a card: "<label> · <first 8 of the id> · v<key version>", ASCII only. */
export function cardFooter(qrId: string, keyVersion: number, label?: string | null): string {
  return `${label ? label + ' · ' : ''}${qrId.slice(0, 8)} · v${keyVersion}`;
}
