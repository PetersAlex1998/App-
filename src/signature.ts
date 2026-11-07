import type { LetterModel, SigField } from './letters';
import type { Settings } from './settingsDefaults';

/** Hilfen zum Unterschreiben am Handy: Zuschnitt der Zeichnung, Felder eines Schreibens, Nachweis-Text, Hinweis zur gesetzlichen Form. */

/** Umrandung der gezeichneten Pixel (Alphakanal über der Schwelle) in RGBA-Daten, oder null, wenn nichts gezeichnet ist. */
export function bboxOfAlpha(data: ArrayLike<number>, w: number, h: number, threshold = 8): { x: number; y: number; w: number; h: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > threshold) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Unterschriftsfelder eines Schreibens (je Schlüssel einmal, in der Reihenfolge des Dokuments). */
export function signFields(m: Pick<LetterModel, 'blocks'>): SigField[] {
  const out: SigField[] = [];
  for (const b of m.blocks) if (b.t === 'sigs') for (const f of b.fields) if (!out.some((x) => x.key === f.key)) out.push(f);
  return out;
}

export const FORM_HINT = 'Hinweis zur Form: Für Kündigungen und für Mietverträge, die länger als ein Jahr laufen oder befristet sind, verlangt das Gesetz die Schriftform, also die eigenhändige Unterschrift auf Papier (§§ 126, 550, 568 BGB). Eine am Handy gezeichnete Unterschrift ersetzt das nicht. Nutze sie dann nur als Entwurf oder zur Ablage und lass das Original auf Papier unterschreiben. Bei Zweifeln frage eine Rechtsberatung.';

const two = (n: number) => String(n).padStart(2, '0');
export const stamp = (d: Date) => `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} um ${two(d.getHours())}:${two(d.getMinutes())} Uhr`;

/** Nachweis unter dem Schreiben: wer wann am Gerät unterschrieben hat. */
export function auditLines(signed: { label: string; name?: string }[], at: Date = new Date()): string[] {
  if (!signed.length) return [];
  return [`Am Gerät unterschrieben (gezeichnete Unterschrift, keine qualifizierte elektronische Signatur): ${signed.map((s) => `${s.label}${s.name ? ` ${s.name}` : ''}`).join(', ')} am ${stamp(at)}.`];
}

/** Schreiben für die Ablage im Datensatz: ohne Logo, Unterschriften und Nachweis (die kommen beim Unterschreiben wieder dazu). */
export function stripForStorage(m: LetterModel): LetterModel {
  const { logo: _l, signatures: _s, audit: _a, ...rest } = m;
  return rest as LetterModel;
}

/** Gespeichertes Schreiben für das PDF: aktuelles Logo, Unterschriften und Nachweis einsetzen. */
export function withSignatures(m: LetterModel, s: Pick<Settings, 'logo'>, signatures: Record<string, string>, audit: string[]): LetterModel {
  return { ...m, logo: s.logo || undefined, signatures: { ...(m.signatures ?? {}), ...signatures }, audit: audit.length ? audit : m.audit };
}
