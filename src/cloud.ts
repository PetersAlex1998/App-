import AsyncStorage from '@react-native-async-storage/async-storage';
import { CLOUD_BUCKET, CLOUD_KEY, CLOUD_URL } from './cloudConfig';
import { PushRow, Remote, RemoteRow, SyncState, freshState } from './sync';

/** Schlanker Zugriff auf Supabase (Anmeldung, Tabelle, Dateispeicher) per fetch. */

export interface Session { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email: string } }
const SESSION_KEY = 'immo-cloud-session';
const STATE_KEY = 'immo-sync-v1';

let session: Session | null = null;
let loaded = false;

export async function loadSession(): Promise<Session | null> {
  if (loaded) return session;
  loaded = true;
  try { const raw = await AsyncStorage.getItem(SESSION_KEY); session = raw ? JSON.parse(raw) : null; } catch { session = null; }
  return session;
}
async function setSession(s: Session | null) {
  session = s;
  loaded = true;
  if (s) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s)).catch(() => {});
  else await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
}

const baseHeaders = () => ({ apikey: CLOUD_KEY });

async function authCall(path: string, body: object) {
  let res: Response;
  try { res = await fetch(`${CLOUD_URL}/auth/v1/${path}`, { method: 'POST', headers: { ...baseHeaders(), 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error('Keine Verbindung zur Cloud. Prüfe dein Internet.'); }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(germanAuthError(json?.msg || json?.error_description || json?.message || json?.error || `Fehler ${res.status}`));
  return json;
}
export function germanAuthError(m: string): string {
  const s = String(m).toLowerCase();
  if (s.includes('invalid login')) return 'E-Mail oder Passwort ist falsch.';
  if (s.includes('already registered') || s.includes('already been registered')) return 'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.';
  if (s.includes('email not confirmed')) return 'Bitte zuerst die E-Mail bestätigen (Link im Postfach).';
  if (s.includes('password') && s.includes('characters')) return 'Das Passwort ist zu kurz (mindestens 8 Zeichen).';
  if (s.includes('signups not allowed') || s.includes('signup is disabled')) return 'Neue Konten sind gesperrt. Melde dich mit dem bestehenden Konto an.';
  if (s.includes('rate limit')) return 'Zu viele Versuche. Bitte in einigen Minuten erneut versuchen.';
  return String(m);
}
const toSession = (j: any): Session => ({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600), user: { id: j.user.id, email: j.user.email ?? '' } });

export async function signIn(email: string, password: string): Promise<Session> {
  const s = toSession(await authCall('token?grant_type=password', { email, password }));
  await setSession(s);
  return s;
}
/** Neues Konto. Liefert null, wenn erst die E-Mail bestätigt werden muss. */
export async function signUp(email: string, password: string): Promise<Session | null> {
  const j = await authCall('signup', { email, password });
  if (!j.access_token) return null;
  const s = toSession(j);
  await setSession(s);
  return s;
}
export async function signOut() {
  const s = session;
  await setSession(null);
  await AsyncStorage.removeItem(STATE_KEY).catch(() => {});
  if (s) fetch(`${CLOUD_URL}/auth/v1/logout`, { method: 'POST', headers: { ...baseHeaders(), authorization: `Bearer ${s.access_token}` } }).catch(() => {});
}

async function token(): Promise<{ jwt: string; uid: string }> {
  const s = await loadSession();
  if (!s) throw new Error('Nicht angemeldet.');
  if (s.expires_at - 60 > Date.now() / 1000) return { jwt: s.access_token, uid: s.user.id };
  try {
    const n = toSession(await authCall('token?grant_type=refresh_token', { refresh_token: s.refresh_token }));
    await setSession(n);
    return { jwt: n.access_token, uid: n.user.id };
  } catch (e: any) {
    if (/Keine Verbindung/.test(e.message)) throw e;
    await setSession(null);
    throw new Error('Die Anmeldung ist abgelaufen. Bitte neu anmelden.');
  }
}

async function api(path: string, init: RequestInit = {}, jwt?: string): Promise<Response> {
  const t = jwt ?? (await token()).jwt;
  let res: Response;
  try { res = await fetch(`${CLOUD_URL}${path}`, { ...init, headers: { ...baseHeaders(), authorization: `Bearer ${t}`, ...(init.headers as object) } }); }
  catch { throw new Error('Keine Verbindung zur Cloud. Prüfe dein Internet.'); }
  return res;
}
const fail = async (res: Response, what: string) => { const t = await res.text().catch(() => ''); throw new Error(`${what} (${res.status}) ${t.slice(0, 160)}`); };

export const cloudRemote: Remote = {
  async pull(since) {
    const out: RemoteRow[] = [];
    let cursor = since;
    for (;;) {
      const q = `select=kind,id,data,deleted,client_updated_at,updated_at${cursor ? `&updated_at=gt.${encodeURIComponent(cursor)}` : ''}&order=updated_at.asc&limit=1000`;
      const res = await api(`/rest/v1/immo_records?${q}`);
      if (!res.ok) await fail(res, 'Abholen fehlgeschlagen');
      const rows: RemoteRow[] = await res.json();
      out.push(...rows);
      if (rows.length < 1000) return out;
      cursor = rows[rows.length - 1].updated_at;
    }
  },
  async push(rows: PushRow[]) {
    if (!rows.length) return;
    const res = await api('/rest/v1/immo_records?on_conflict=user_id,kind,id', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    if (!res.ok) await fail(res, 'Hochladen fehlgeschlagen');
  },
  async upload(id, blob) {
    const { uid } = await token();
    const res = await api(`/storage/v1/object/${CLOUD_BUCKET}/${uid}/${id}`, { method: 'POST', headers: { 'content-type': blob.type || 'application/octet-stream', 'x-upsert': 'true' }, body: blob });
    if (!res.ok) await fail(res, 'Datei hochladen fehlgeschlagen');
  },
  async removeFile(id) {
    const { uid } = await token();
    await api(`/storage/v1/object/${CLOUD_BUCKET}/${uid}/${id}`, { method: 'DELETE' });
  },
};

/** Datei aus der Cloud holen (z. B. Beleg, der auf einem anderen Gerät aufgenommen wurde). */
export async function downloadFile(id: string): Promise<Blob | null> {
  if (!(await loadSession())) return null;
  try {
    const { uid } = await token();
    const res = await api(`/storage/v1/object/authenticated/${CLOUD_BUCKET}/${uid}/${id}`);
    return res.ok ? await res.blob() : null;
  } catch { return null; }
}

export async function loadSyncState(userId: string): Promise<SyncState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const s: SyncState | null = raw ? JSON.parse(raw) : null;
    if (s && s.userId === userId) return s;
  } catch { /* neu beginnen */ }
  return freshState(userId);
}
export const saveSyncState = (s: SyncState) => AsyncStorage.setItem(STATE_KEY, JSON.stringify(s));

/** Ruft eine Supabase-Funktion auf (mit der Anmeldung des Nutzers). */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  if (!(await loadSession())) throw new Error('Dafür musst du in der Cloud angemeldet sein (Daten → Cloud).');
  const res = await api(`/functions/v1/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || json?.message || `Fehler ${res.status}`);
  return json as T;
}
