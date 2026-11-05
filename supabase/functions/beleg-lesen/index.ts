// Supabase Edge Function: liest einen Beleg (Foto oder PDF) mit Claude aus.
// Der API-Schlüssel (ANTHROPIC_API_KEY) liegt nur als Secret in Supabase, nie in der App.
// Aufruf nur mit gültiger Anmeldung (JWT-Prüfung durch Supabase).
import Anthropic from "npm:@anthropic-ai/sdk";

const MODEL = Deno.env.get("BELEG_MODEL") ?? "claude-opus-5-5";
const CATEGORIES = ["instandhaltung", "betriebskosten", "hausmeister", "verwaltung", "versicherung", "grundsteuer", "schuldzinsen", "afa", "fahrtkosten", "sonstiges"];
const MAX_BASE64 = 7_000_000; // ca. 5 MB Datei
const DAILY_LIMIT = Math.max(1, Math.min(500, Number(Deno.env.get("BELEG_DAILY_LIMIT") ?? "40") || 40)); // Belege pro Nutzer und Tag

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const schema = {
  type: "object",
  properties: {
    vendor: { type: ["string", "null"], description: "Name des Rechnungstellers / Geschäfts" },
    date: { type: ["string", "null"], description: "Rechnungs- oder Zahlungsdatum als YYYY-MM-DD" },
    amount: { type: ["number", "null"], description: "Gesamtbetrag brutto in Euro (positiv)" },
    category: { type: "string", enum: CATEGORIES },
    description: { type: ["string", "null"], description: "Kurze Beschreibung der Leistung, höchstens 80 Zeichen" },
    readable: { type: "boolean", description: "false, wenn das Bild kein lesbarer Beleg ist" },
  },
  required: ["vendor", "date", "amount", "category", "description", "readable"],
  additionalProperties: false,
};

const PROMPT = `Lies diesen Beleg (Rechnung, Kassenbon oder Quittung) für die Vermietung einer Immobilie in Deutschland.
Gib zurück: Rechnungsteller, Datum (YYYY-MM-DD), den zu zahlenden Gesamtbetrag brutto in Euro, eine kurze Beschreibung und die passende Kategorie:
- instandhaltung: Reparaturen, Handwerker, Material, Wartung
- betriebskosten: Wasser, Abwasser, Müll, Heizung, Strom Allgemein, Schornsteinfeger, Gartenpflege Nebenkosten
- hausmeister: Hausmeister, Reinigung
- verwaltung: Verwaltung, Steuerberater, Rechtsberatung, Kontoführung
- versicherung: Gebäude-, Haftpflicht- und andere Versicherungen
- grundsteuer, schuldzinsen, afa, fahrtkosten
- sonstiges: alles andere
Erfinde nichts: Ist ein Feld nicht lesbar, setze null. Ist es kein Beleg, setze readable=false.`;

/** Zählt einen Aufruf gegen das Tageslimit des angemeldeten Nutzers (Funktion immo_ai_take in der Datenbank). */
async function takeQuota(req: Request): Promise<"ok" | "limit" | "error"> {
  const url = Deno.env.get("SUPABASE_URL");
  const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const auth = req.headers.get("authorization");
  if (!url || !apikey || !auth) return "error";
  try {
    const r = await fetch(`${url}/rest/v1/rpc/immo_ai_take`, { method: "POST", headers: { apikey, authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ p_limit: DAILY_LIMIT }) });
    if (!r.ok) { console.error("beleg-lesen: Limit-Prüfung", r.status, await r.text()); return "error"; }
    return (await r.json()) === true ? "ok" : "limit";
  } catch (e) { console.error("beleg-lesen: Limit-Prüfung", e); return "error"; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST erlaubt." }, 405);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Der KI-Zugang ist noch nicht eingerichtet (ANTHROPIC_API_KEY fehlt)." }, 503);

  let body: { image?: string; mediaType?: string };
  try { body = await req.json(); } catch { return json({ error: "Ungültige Anfrage." }, 400); }
  const { image, mediaType } = body;
  const okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
  if (!image || typeof image !== "string" || !mediaType || !okTypes.includes(mediaType)) return json({ error: "Bitte ein Foto (JPG, PNG) oder PDF senden." }, 400);
  if (image.length > MAX_BASE64) return json({ error: "Die Datei ist zu groß (maximal ca. 5 MB)." }, 413);

  const quota = await takeQuota(req);
  if (quota === "limit") return json({ error: `Das Tageslimit von ${DAILY_LIMIT} automatisch gelesenen Belegen ist erreicht. Morgen geht es weiter, oder trage den Beleg selbst ein.` }, 429);
  if (quota === "error") return json({ error: "Die Nutzungsprüfung ist nicht erreichbar. Bitte später erneut versuchen." }, 503);

  const client = new Anthropic({ apiKey: key });
  try {
    const part = mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: image } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: image } };
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: [part, { type: "text", text: PROMPT }] }],
    } as never);
    if (res.stop_reason === "refusal") return json({ error: "Der Beleg konnte nicht gelesen werden." }, 422);
    const text = res.content.find((b: { type: string }) => b.type === "text") as { text: string } | undefined;
    if (!text) return json({ error: "Keine Antwort erhalten." }, 502);
    return json({ data: JSON.parse(text.text), usage: res.usage });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error("beleg-lesen:", e);
    return json({ error: status === 429 ? "Die KI ist gerade ausgelastet. Bitte gleich noch einmal versuchen." : "Das Auslesen ist fehlgeschlagen." }, status === 429 ? 429 : 502);
  }
});
