import { Doc, Tenant } from './types';
import type { Settings } from './settingsDefaults';
import { signFields, stripForStorage, withSignatures } from './signature';
import type { LetterModel } from './letters';
import { modelToPdf, mergePdfs } from './pdfgen';
import { getBlob, putBlob } from './files';
import { uid } from './uid';
import { today } from './calc';

/** Uint8Array -> PDF-Blob (eigener ArrayBuffer, damit Typen und Browser zufrieden sind). */
export const pdfBlob = (bytes: Uint8Array) => new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });

/** Briefe als PDF erzeugen und im Gerät ablegen (Status „bereit“). Liefert die Dokument-Einträge. */
export async function storeLetters(items: { model: LetterModel; tenant: Tenant; note?: string }[]): Promise<Doc[]> {
  const docs: Doc[] = [];
  for (const it of items) {
    const bytes = await modelToPdf(it.model);
    const id = uid();
    await putBlob(id, pdfBlob(bytes));
    // Schreiben mit Unterschriftsfeldern: Aufbau merken, damit es später am Handy unterschrieben werden kann
    const signable = signFields(it.model).length > 0;
    docs.push({ id, ownerKind: 'tenant', ownerId: it.tenant.id, category: 'brief', name: it.model.title, mime: 'application/pdf', size: bytes.length, added: today(), status: 'bereit', note: it.note, ...(signable ? { letter: stripForStorage(it.model), ...(it.model.audit?.length ? { signed: new Date().toISOString() } : {}) } : {}) });
  }
  return docs;
}

/** Ausgewählte Briefe zu einer PDF-Datei zusammenfügen. */
export async function mergeStored(docs: Doc[]): Promise<Blob> {
  const parts: Uint8Array[] = [];
  for (const d of docs) {
    const b = await getBlob(d.id);
    if (b) parts.push(new Uint8Array(await b.arrayBuffer()));
  }
  if (parts.length === 0) throw new Error('Die Dateien wurden nicht gefunden.');
  return pdfBlob(await mergePdfs(parts));
}

/** Gespeichertes Schreiben unterschreiben: PDF mit den gezeichneten Unterschriften neu erzeugen und das Dokument aktualisieren. */
export async function signStored(doc: Doc, s: Pick<Settings, 'logo'>, signatures: Record<string, string>, audit: string[], place?: string, date?: string): Promise<Doc> {
  if (!doc.letter) throw new Error('Dieses Schreiben hat keine Unterschriftsfelder.');
  const bytes = await modelToPdf(withSignatures(doc.letter, s, signatures, audit, place, date));
  await putBlob(doc.id, pdfBlob(bytes));
  return { ...doc, size: bytes.length, signed: new Date().toISOString() };
}
