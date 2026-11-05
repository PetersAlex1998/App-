import { DB, Doc, Unit } from './types';
import { getBlob } from './files';

/** Fotos der Wohnung und des Hauses (Dokumente der Kategorie Foto), Wohnungsfotos zuerst. */
export function photoDocs(db: DB, unit: Unit): Doc[] {
  const ok = (d: Doc) => d.category === 'foto' && /^image\/(jpeg|png|webp)/.test(d.mime);
  const own = db.documents.filter((d) => ok(d) && d.ownerKind === 'unit' && d.ownerId === unit.id);
  const house = db.documents.filter((d) => ok(d) && d.ownerKind === 'property' && d.ownerId === unit.propertyId);
  return [...own, ...house];
}

/** Foto als JPEG-Bytes in vernünftiger Größe (nur im Browser). */
export async function photoBytes(id: string, maxW = 1600): Promise<Uint8Array | null> {
  const blob = await getBlob(id);
  if (!blob) return null;
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, maxW / bmp.width);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    const out: Blob | null = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
    return out ? new Uint8Array(await out.arrayBuffer()) : null;
  } catch { return null; }
}
