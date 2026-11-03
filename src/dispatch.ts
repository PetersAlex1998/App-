import { Platform } from 'react-native';
import type { Doc } from './types';

/**
 * Versand-Schnittstelle. Heute gibt es nur den manuellen Weg (Teilen-Menü des Handys).
 * Ein Dienst wie die E-POST der Deutschen Post wird später als weiterer Anbieter ergänzt,
 * ohne dass Briefaufbau, Ablage oder Briefausgang geändert werden müssen.
 */
export interface LetterToSend { doc: Doc; pdf: Blob; recipient: string[] }
export interface SendResult { ok: boolean; trackingId?: string; error?: string }
export interface DispatchProvider {
  id: string;
  label: string;
  ready: boolean; // false = noch kein Konto / nicht eingerichtet
  hint?: string;
  send(letters: LetterToSend[]): Promise<SendResult>;
}

/** Dateiname in einfachen Zeichen (ä -> ae, – -> -), damit Download und Teilen überall funktionieren. */
export const safeName = (s: string) =>
  s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[\u2010-\u2015]/g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ._()\-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Brief';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const canShareFiles = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof (navigator as any).canShare === 'function';

/** Teilen-Menü des Geräts (Mail, Nachrichten, Dateien, Post-App, iCloud/Drive …); sonst Download. */
export async function shareFiles(files: { name: string; blob: Blob; ext?: string }[], title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const list = files.map((f) => new File([f.blob], `${safeName(f.name)}.${f.ext ?? 'pdf'}`, { type: f.blob.type || (f.ext === 'json' ? 'application/json' : 'application/pdf') }));
  const nav = navigator as any;
  if (canShareFiles() && nav.canShare({ files: list })) {
    try { await nav.share({ files: list, title }); return 'shared'; }
    catch (e: any) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  list.forEach((f) => downloadBlob(f, f.name));
  return 'downloaded';
}

/** Manueller Versand: Teilen-Menü bzw. Download. Der Nutzer schickt selbst ab und markiert „versendet“. */
export const manualProvider: DispatchProvider = {
  id: 'manuell',
  label: 'Manuell (Teilen-Menü)',
  ready: true,
  async send(letters) {
    const r = await shareFiles(letters.map((l) => ({ name: l.doc.name, blob: l.pdf })), 'Briefe');
    return { ok: r !== 'cancelled' };
  },
};

/** Platzhalter: wird mit dem Konto bei der Deutschen Post ergänzt. */
export const epostProvider: DispatchProvider = {
  id: 'epost',
  label: 'E-POST (Deutsche Post)',
  ready: false,
  hint: 'Noch nicht eingerichtet – dafür ist ein Konto bei der Deutschen Post nötig.',
  async send() { return { ok: false, error: 'E-POST ist noch nicht eingerichtet.' }; },
};

export const providers: DispatchProvider[] = [manualProvider, epostProvider];
