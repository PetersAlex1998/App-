import { Doc, Tenant } from './types';
import type { LetterModel } from './letters';
import { modelToPdf, mergePdfs } from './pdfgen';
import { getBlob, putBlob } from './files';
import { uid } from './store';
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
    docs.push({ id, ownerKind: 'tenant', ownerId: it.tenant.id, category: 'brief', name: it.model.title, mime: 'application/pdf', size: bytes.length, added: today(), status: 'bereit', note: it.note });
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
