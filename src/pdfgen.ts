import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { Block, LetterModel } from './letters';
import { dateDE } from './calc';

/** Echte PDF-Datei (A4, DIN 5008 Form B) aus dem Brief-Modell. Läuft komplett im Gerät. */

const MM = 72 / 25.4;
const mm = (v: number) => v * MM;
const PW = 595.28;
const PH = 841.89;
const TEXT_L = mm(25);
const TEXT_R = mm(190);
const TEXT_W = TEXT_R - TEXT_L;
const BOTTOM = PH - mm(30); // Textende (Platz für Fußzeile)

// Nur Zeichen der Standardschrift (Windows-1252) zulassen, Rest durch ? ersetzen
const NOT_WINANSI = /[^ -~ -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g;
const safe = (s: string) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(NOT_WINANSI, '?');

const GRAY = rgb(0.27, 0.27, 0.27);
const LINE = rgb(0.73, 0.73, 0.73);
const INK = rgb(0.07, 0.07, 0.07);

interface Seg { w: string; bold: boolean }
/** Ein „Wort“ kann aus mehreren Segmenten bestehen (z. B. **19.11.2026** + „.“ ohne Lücke). */
interface Tok { segs: Seg[] }
const tokens = (text: string): Tok[] => {
  const out: Tok[] = [];
  let brk = true;
  safe(text).split(/(\*\*.+?\*\*)/).forEach((part) => {
    const bold = part.startsWith('**') && part.endsWith('**') && part.length > 4;
    const txt = bold ? part.slice(2, -2) : part;
    for (const m of txt.matchAll(/(\s+)|(\S+)/g)) {
      if (m[1]) { brk = true; continue; }
      if (brk || !out.length) out.push({ segs: [{ w: m[2], bold }] });
      else out[out.length - 1].segs.push({ w: m[2], bold });
      brk = false;
    }
  });
  return out;
};

class Writer {
  page!: PDFPage;
  y = 0; // Abstand vom oberen Seitenrand (pt)
  pages = 0;
  constructor(public doc: PDFDocument, public f: PDFFont, public fb: PDFFont) {}

  newPage() {
    this.page = this.doc.addPage([PW, PH]);
    this.pages++;
    this.y = mm(20);
  }
  ensure(h: number, redraw?: () => void) {
    if (this.y + h > BOTTOM) { this.newPage(); redraw?.(); }
  }
  font(bold: boolean) { return bold ? this.fb : this.f; }
  /** Text in eine Zeilenbox [yTop, yTop+lh] schreiben (vertikal zentriert). */
  put(x: number, yTop: number, lh: number, str: string, size: number, bold = false, color = INK) {
    this.page.drawText(safe(str), { x, y: PH - (yTop + lh / 2 + size * 0.33), size, font: this.font(bold), color });
  }
  width(str: string, size: number, bold = false) { return this.font(bold).widthOfTextAtSize(safe(str), size); }
  line(x1: number, y1: number, x2: number, y2: number, t = 0.3, color = LINE) {
    this.page.drawLine({ start: { x: x1, y: PH - y1 }, end: { x: x2, y: PH - y2 }, thickness: t, color });
  }
  tokW(t: Tok, size: number, forceBold = false) { return t.segs.reduce((a, g) => a + this.width(g.w, size, forceBold || g.bold), 0); }
  /** Zeilen umbrechen (mit **fett**). */
  wrap(text: string, maxW: number, size: number): Tok[][] {
    const lines: Tok[][] = [[]];
    let cur = 0;
    const space = this.width(' ', size);
    for (let tok of tokens(text)) {
      // zu lange einfache Wörter hart trennen
      while (tok.segs.length === 1 && this.tokW(tok, size) > maxW && tok.segs[0].w.length > 1) {
        const { w, bold } = tok.segs[0];
        let n = w.length - 1;
        while (n > 1 && this.width(w.slice(0, n), size, bold) > maxW) n--;
        if (lines[lines.length - 1].length) { lines.push([]); cur = 0; }
        lines[lines.length - 1].push({ segs: [{ w: w.slice(0, n), bold }] });
        lines.push([]); cur = 0;
        tok = { segs: [{ w: w.slice(n), bold }] };
      }
      const ww = this.tokW(tok, size);
      const add = (lines[lines.length - 1].length ? space : 0) + ww;
      if (cur + add > maxW && lines[lines.length - 1].length) { lines.push([]); cur = 0; }
      cur += (lines[lines.length - 1].length ? space : 0) + ww;
      lines[lines.length - 1].push(tok);
    }
    return lines.filter((l) => l.length);
  }
  lineW(toks: Tok[], size: number, forceBold = false) { return toks.reduce((a, t, k) => a + this.tokW(t, size, forceBold) + (k ? this.width(' ', size) : 0), 0); }
  drawTokens(x: number, yTop: number, lh: number, toks: Tok[], size: number, color = INK, forceBold = false) {
    let cx = x;
    const space = this.width(' ', size);
    toks.forEach((t, i) => {
      if (i) cx += space;
      t.segs.forEach((g) => {
        this.put(cx, yTop, lh, g.w, size, forceBold || g.bold, color);
        cx += this.width(g.w, size, forceBold || g.bold);
      });
    });
  }
  fit(str: string, maxW: number, size: number, bold = false) {
    let s = safe(str);
    if (this.width(s, size, bold) <= maxW) return s;
    while (s.length > 1 && this.width(s + '…', size, bold) > maxW) s = s.slice(0, -1);
    return s + '…';
  }
}

function dataUrlBytes(url: string): { bytes: Uint8Array; png: boolean } {
  const m = url.match(/^data:(image\/[a-z+]+);base64,(.*)$/);
  if (!m) throw new Error('Ungültiges Logo');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, png: m[1] === 'image/png' };
}

function drawBlock(w: Writer, b: Block) {
  switch (b.t) {
    case 'h1': {
      w.ensure(mm(14));
      w.put(TEXT_L, w.y, 17, b.text, 13, true);
      w.y += 17 + mm(5);
      break;
    }
    case 'p': {
      const size = b.small ? 8 : 10.5;
      const lh = size * 1.35;
      const lines = w.wrap(b.text, TEXT_W, size);
      for (const l of lines) {
        w.ensure(lh);
        w.drawTokens(TEXT_L, w.y, lh, l, size, b.small ? GRAY : INK);
        w.y += lh;
      }
      w.y += mm(3.5);
      break;
    }
    case 'sign': {
      w.y += mm(4.5);
      const lh = 10.5 * 1.35;
      w.ensure(lh * b.lines.length);
      for (const l of b.lines) { w.put(TEXT_L, w.y, lh, l, 10.5); w.y += lh; }
      w.y += mm(3);
      break;
    }
    case 'kv': {
      const size = 9.5;
      const lh = size * 1.35;
      const pad = mm(1.6);
      const keyW = Math.max(...b.rows.map(([k]) => w.width(k, 8))) + mm(4);
      const valW = TEXT_W - keyW - mm(6);
      w.y += mm(1);
      for (const [k, v] of b.rows) {
        const lines = w.wrap(v, valW, size);
        const h = lines.length * lh + pad * 2;
        w.ensure(h);
        w.put(TEXT_L + mm(1.5), w.y + pad, lh, k, 8, false, GRAY);
        lines.forEach((l, i) => w.drawTokens(TEXT_L + keyW, w.y + pad + i * lh, lh, l, size));
        w.line(TEXT_L, w.y + h, TEXT_L + keyW + valW, w.y + h);
        w.y += h;
      }
      w.y += mm(4);
      break;
    }
    case 'table': {
      const size = 9.5;
      const lh = size * 1.3;
      const padY = mm(1.6);
      const padX = mm(1.5);
      const cw = b.widths.map((f) => f * TEXT_W);
      const x0 = cw.map((_, i) => TEXT_L + cw.slice(0, i).reduce((a, c) => a + c, 0));
      const cell = (i: number, span: number) => ({ x: x0[i], w: cw.slice(i, i + span).reduce((a, c) => a + c, 0) });
      const drawHead = () => {
        const h = lh + padY * 2;
        b.head.forEach((t, i) => {
          const c = cell(i, 1);
          const tx = b.align[i] === 'r' ? c.x + c.w - padX - w.width(t, size, true) : c.x + padX;
          w.put(tx, w.y + padY, lh, t, size, true);
        });
        w.line(TEXT_L, w.y + h, TEXT_R, w.y + h);
        w.y += h;
      };
      w.y += mm(2);
      w.ensure(mm(24));
      drawHead();
      for (const r of b.rows) {
        const span = r.span ?? 1;
        const wrapped = r.cells.map((t, i) => {
          if (i > 0 && i < span) return [] as Tok[][];
          const c = cell(i, i === 0 ? span : 1);
          return w.wrap(t, c.w - padX * 2, size);
        });
        const nLines = Math.max(1, ...wrapped.map((l) => l.length));
        const h = nLines * lh + padY * 2;
        w.ensure(h, drawHead);
        r.cells.forEach((t, i) => {
          if (i > 0 && i < span) return;
          const c = cell(i, i === 0 ? span : 1);
          wrapped[i].forEach((line, li) => {
            const lw = w.lineW(line, size, !!r.bold);
            const tx = b.align[i] === 'r' ? c.x + c.w - padX - lw : c.x + padX;
            w.drawTokens(tx, w.y + padY + li * lh, lh, line, size, INK, !!r.bold);
          });
        });
        w.line(TEXT_L, w.y + h, TEXT_R, w.y + h);
        w.y += h;
      }
      w.y += mm(4);
      break;
    }
  }
}

export async function modelToPdf(m: LetterModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(m.title);
  doc.setProducer('Immo Verwaltung');
  doc.setCreator('Immo Verwaltung');
  doc.setCreationDate(new Date(m.date + 'T12:00:00'));
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  w.newPage();

  // ── Falz- und Lochmarken ──
  w.line(0, mm(105), mm(5), mm(105), 0.4, rgb(0.33, 0.33, 0.33));
  w.line(0, mm(148.5), mm(8), mm(148.5), 0.4, rgb(0.33, 0.33, 0.33));
  w.line(0, mm(210), mm(5), mm(210), 0.4, rgb(0.33, 0.33, 0.33));

  // ── Testbrief: Fensterrahmen (gestrichelt) und Beschriftung ──
  if (m.guides) {
    w.page.drawRectangle({ x: mm(20), y: PH - mm(90), width: mm(85), height: mm(45), borderColor: rgb(0.85, 0.2, 0.2), borderWidth: 0.6, borderDashArray: [3, 2], opacity: 0, borderOpacity: 0.9 });
    w.put(mm(20), mm(90) + 1, 10, 'Fenster 85 × 45 mm', 6.5, false, rgb(0.85, 0.2, 0.2));
  }

  // ── Briefkopf: Logo links, Absender rechts ──
  if (m.logo) {
    try {
      const { bytes, png } = dataUrlBytes(m.logo);
      const img: PDFImage = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const k = Math.min(mm(70) / img.width, mm(24) / img.height, 1 * 10);
      const iw = img.width * k;
      const ih = img.height * k;
      w.page.drawImage(img, { x: TEXT_L, y: PH - mm(10) - ih, width: iw, height: ih });
    } catch { /* ungültiges Logo ignorieren */ }
  }
  m.senderLines.forEach((l, i) => {
    const lh = 9 * 1.45;
    w.put(TEXT_R - w.width(l, 9), mm(10) + i * lh, lh, l, 9, false, GRAY);
  });

  // ── Rücksendezeile + Anschriftfeld (Fenster: 20 mm links, 45 mm oben, 85 × 45 mm) ──
  if (m.returnLine) {
    let size = 7;
    while (size > 5.5 && w.width(m.returnLine, size) > mm(85)) size -= 0.25;
    w.put(mm(20), mm(57), mm(4.8), w.fit(m.returnLine, mm(85), size), size, false, GRAY);
    w.line(mm(20), mm(61.8), mm(105), mm(61.8), 0.3, rgb(0.53, 0.53, 0.53));
  }
  const lhA = mm(4.5);
  m.address.slice(0, 6).forEach((l, i) => w.put(mm(20), mm(62.7) + i * lhA, lhA, w.fit(l, mm(85), 10.5), 10.5));
  if (m.unitNote && m.address.length < 6) w.put(mm(20), mm(62.7) + m.address.length * lhA, lhA, w.fit(m.unitNote, mm(85), 8), 8, false, GRAY);

  // ── Infoblock rechts (Datum, Objekt, Einheit) ──
  const info: [string, string][] = [['Datum', dateDE(m.date)], ...m.info];
  info.forEach(([k, v], i) => {
    const lh = 9 * 1.5;
    const label = `${k}: `;
    w.put(mm(125), mm(50) + i * lh, lh, label, 9, true, rgb(0.2, 0.2, 0.2));
    w.put(mm(125) + w.width(label, 9, true), mm(50) + i * lh, lh, w.fit(v, mm(75) - w.width(label, 9, true), 9), 9, false, rgb(0.2, 0.2, 0.2));
  });

  // ── Text ab 98,5 mm ──
  w.y = mm(98.5);
  for (const b of m.blocks) drawBlock(w, b);

  // ── Fußzeile auf der letzten Seite ──
  if (m.footer.length) {
    const lh = 7.5 * 1.45;
    const top = PH - mm(10) - m.footer.length * lh;
    w.line(TEXT_L, top - mm(2.5), TEXT_R, top - mm(2.5));
    m.footer.forEach((l, i) => {
      const t = w.fit(l, TEXT_W, 7.5);
      w.page.drawText(safe(t), { x: TEXT_L + (TEXT_W - w.width(t, 7.5)) / 2, y: PH - (top + i * lh + lh / 2 + 7.5 * 0.33), size: 7.5, font: w.f, color: rgb(0.33, 0.33, 0.33) });
    });
  }
  return doc.save();
}

/** Mehrere PDFs zu einer Datei zusammenfügen. */
export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const p of parts) {
    const src = await PDFDocument.load(p);
    (await out.copyPages(src, src.getPageIndices())).forEach((pg) => out.addPage(pg));
  }
  out.setProducer('Immo Verwaltung');
  return out.save();
}
