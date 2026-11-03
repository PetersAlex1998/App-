import { Platform } from 'react-native';

/** Dateispeicher für Dokumente und Fotos: IndexedDB im Browser (Web-App). */
export const filesSupported = () => Platform.OS === 'web' && typeof indexedDB !== 'undefined';

const DB_NAME = 'immo-files';
const STORE = 'blobs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
export const putBlob = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id)).then(() => undefined);
const getLocalBlob = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id));
let remoteFallback: ((id: string) => Promise<Blob | null>) | null = null;
/** Cloud-Abruf für Dateien, die auf diesem Gerät fehlen (wird vom Abgleich gesetzt). */
export const setBlobFallback = (fn: ((id: string) => Promise<Blob | null>) | null) => { remoteFallback = fn; };
export const hasBlob = async (id: string) => (await getLocalBlob(id)) !== undefined;
export const getBlob = async (id: string): Promise<Blob | undefined> => {
  const local = await getLocalBlob(id);
  if (local || !remoteFallback) return local;
  const remote = await remoteFallback(id).catch(() => null);
  if (!remote) return undefined;
  await putBlob(id, remote).catch(() => {});
  return remote;
};
export const deleteBlob = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined);

/** Dauerhaften Speicher anfordern, damit der Browser die Dateien nicht von selbst löscht. */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
export async function storageInfo(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted: (await navigator.storage.persisted?.()) ?? false };
  } catch { return null; }
}

export const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Fotos verkleinern (max. 1800 px, JPEG), damit viele Bilder in den Speicher passen. */
export async function shrinkImage(file: File, max = 1800): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 900_000) return file;
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((res) => cv.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85));
  } catch { return file; }
}

/** Dateiauswahl (optional direkt mit der Kamera). */
export function pickFiles(opts: { camera?: boolean; multiple?: boolean; accept?: string } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = opts.accept ?? 'image/*,application/pdf';
    input.multiple = opts.multiple ?? true;
    if (opts.camera) input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
}
export async function dataUrlToBlob(u: string): Promise<Blob> { return (await fetch(u)).blob(); }
