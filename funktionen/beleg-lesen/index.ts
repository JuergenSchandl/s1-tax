// S1 Tax: Beleg lesen
// Liest eine hochgeladene Rechnung (PDF oder Foto) mit Claude und trägt Datum, Lieferant,
// Beträge, Konto und die Steuer-Zuordnung (Vorsteuer, Reverse Charge, ig Erwerb, ausländische
// Steuer, keine) in den Beleg ein. Läuft mit der Anmeldung der Person, die den Beleg hochlädt;
// jede Änderung steht damit im Protokoll unter ihrem Namen.
// Der API-Schlüssel liegt als Secret ANTHROPIC_API_KEY in Supabase, nie im Code.
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

// kleine Helfer (wie in js/logic.js der App)
const MONATE = ["", "Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const STOP = ["gmbh", "und", "der", "die", "das", "austria", "tankstelle", "service", "sagt", "danke", "www", "com", "ag", "eu", "the", "trip", "business", "mastercard"];
const tokens = (s: string) => (String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").match(/[a-z0-9]+/g) || []).filter((w) => w.length >= 3 && !STOP.includes(w) && !/^\d+$/.test(w));
const L = {
  MONATE,
  kfz: (k: number) => k === 630 || (k >= 7250 && k <= 7259),
  aehnlich: (a: string, b: string) => { const x = tokens(a), y = tokens(b); return x.some((w) => y.some((v) => v === w || (w.length >= 4 && v.length >= 4 && (v.startsWith(w) || w.startsWith(v))))); },
  datum: (iso: string) => { if (!iso) return ""; const p = String(iso).slice(0, 10).split("-"); return `${p[2]}.${p[1]}.${p[0]}`; },
  eur: (x: number) => Number(x).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €",
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const KONTEN_HAEUFIG: Record<number, string> = {
  580: "Betriebsausstattung (Anlagegut über 1.000 € netto)", 680: "Geringwertige Betriebsausstattung (Geräte bis 1.000 € netto)",
  5262: "Verbrauchsmaterial", 7250: "PKW Betriebskosten (Treibstoff, Service, Vignette, Maut) – kein Vorsteuerabzug",
  7251: "PKW Parkgebühren – kein Vorsteuerabzug", 7300: "Transporte durch Dritte (Taxi, Uber, Bahn, Flug)", 7340: "Reisespesen (Hotel, Reisebüro)",
  7380: "Postgebühren", 7381: "Telefon / Handy", 7385: "Internet, Software, Abos, Cloud", 7400: "Miete", 7600: "Büromaterial",
  7650: "Werbung (auch Blumen, Geschenke an Kunden)", 7652: "Bewirtungsspesen (Restaurant mit Geschäftspartnern)", 7690: "Spenden und Trinkgelder",
  7700: "Versicherungen", 7750: "Steuerberatung", 7752: "Beratungsaufwand (Subunternehmer, Fremdleistungen)", 7780: "Gebühren und Beiträge (WKO, Mitgliedschaften)",
  7790: "Spesen des Geldverkehrs", 3470: "Umsatzsteuer-Zahlung ans Finanzamt", 3600: "SVS-Beiträge", 9410: "Einkommensteuer (privat)",
};

// deno-lint-ignore no-explicit-any
function regelText(regeln: any[]) {
  if (!regeln.length) return "";
  return `
BESONDERE REGELN je Lieferant (gehen allen anderen Regeln und den bisherigen Zuordnungen vor):
${regeln.map((x) => `- ${x.lieferant}${x.ab ? ` (gilt nur für Rechnungen mit Datum ab ${L.datum(x.ab)}; bei älteren Rechnungen NICHT anwenden, dann alles wie bisher)` : ""}: ${x.nur ? `nur die Positionen von ${x.nur} sind geschäftlich; jede Position (Leitung, Person, Vertrag) als eigene Zeile, mit dem Namen im "text"; alle anderen Positionen mit "privat": true. ` : ""}${x.text || ""}`).join("\n")}
`;
}

// deno-lint-ignore no-explicit-any
function prompt(verlauf: string, bank: { datum?: string; betrag?: number; name?: string } | null, regeln: any[] = []) {
  return `Du liest einen Beleg (Rechnung, Kassabon oder Quittung) oder ein Schreiben einer Behörde für das österreichische Einzelunternehmen
S1 Secure e.U. (Inhaber Jürgen Schandl, Doppelngasse 113, 3400 Klosterneuburg, UID ATU68636158).
Die Firma versteuert nach vereinnahmten Entgelten und ist vorsteuerabzugsberechtigt.
${bank ? `Diese Rechnung wurde am ${bank.datum} mit ${Math.abs(Number(bank.betrag)).toFixed(2)} EUR vom Konto bezahlt (Buchungstext: ${bank.name}).\n` : ""}
Antworte NUR mit einem JSON-Objekt, ohne Erklärung davor oder danach, in genau diesem Aufbau:
{
  "datum": "JJJJ-MM-TT (Rechnungs- bzw. Belegdatum)",
  "lieferant": "kurzer Name wie in einer Buchhaltung, z. B. A1 Telekom, Amazon, OMV, Adobe",
  "text": "kurze Bezeichnung auf Deutsch, z. B. Internet 11/2026, Treibstoff, Büromaterial, Restaurant, Software-Abo",
  "rechnungsnr": "Rechnungsnummer oder null",
  "lieferant_uid": "UID/VAT-Nummer des Lieferanten oder null",
  "land": "ISO-Ländercode des Lieferanten, z. B. AT, DE, IE, US",
  "waehrung": "ISO-Währung des Betrags auf dem Beleg, z. B. EUR",
  "fremdbetrag": "Bruttobetrag in Fremdwährung, wenn nicht EUR, sonst null",
  "zahlungsart": "karte, bar, ueberweisung oder null (wie bezahlt wurde)",
  "dokumentart": "beleg oder behoerde",
  "behoerde": null,
  "empfaenger": "an wen die Rechnung adressiert ist (Firma oder Name, wie auf dem Beleg), null bei Kassabon ohne Empfänger",
  "an_s1": "true, wenn die Rechnung an S1 Secure oder Jürgen Schandl geht; false, wenn an jemand anderen; null bei Kassabon ohne Empfänger",
  "zeilen": [ { "konto": 7385, "text": "Bezeichnung", "brutto": 0.00, "netto": 0.00, "ust": 0.00, "steuersatz": 20, "steuerart": "vst", "privat": false } ],
  "anlage": false,
  "garantie_monate": null,
  "frage": null,
  "begruendung": "ein Satz, warum diese Steuer-Zuordnung",
  "volltext": "die wichtigsten Wörter und Zahlen des Belegs, höchstens 1200 Zeichen"
}

Regeln für "zeilen":
- Eine Zeile pro Steuersatz (z. B. Restaurant 10 % Speisen und 20 % Getränke = zwei Zeilen). Beträge in EUR mit 2 Nachkommastellen, netto + ust = brutto.
- privat: true nur für Positionen, die laut einer besonderen Regel privat sind; sonst false.
- Ist der Beleg nicht in EUR, rechne mit dem bezahlten EUR-Betrag${bank ? " vom Konto" : ""}.
- steuerart:
  "vst" = österreichische Umsatzsteuer ist ausgewiesen (österreichischer Lieferant oder österreichische UID) → Vorsteuer.
  "keine" = keine Umsatzsteuer (Versicherung, Post, Gebühren, Finanzamt, SVS, Kleinunternehmer) ODER alles rund ums Auto
           (Treibstoff, Parken, Maut, Vignette, Service, Autowäsche, Konten 7250/7251): beim PKW gibt es keinen Vorsteuerabzug, dann ust = 0 und netto = brutto.
  "ausland" = ausländische Umsatzsteuer ist ausgewiesen (z. B. deutsche 19 %, spanische 21 %, italienische 22 %) → nicht abziehbar: ust = 0, netto = brutto, steuersatz = ausländischer Satz.
  "rc" = Dienstleistung (Software, Abo, Cloud, Werbung, Beratung, Lizenz) einer ausländischen Firma, egal ob EU oder Drittland,
         OHNE österreichische Umsatzsteuer (Reverse Charge, 0 % VAT, "tax to be paid by recipient" oder gar keine Steuer) → ust = 0, netto = brutto, steuersatz = 20.
         NICHT bei Leistungen, die im Ausland verbraucht werden (Hotel, Restaurant, Tanken, Taxi, Parken im Ausland): dort "ausland" oder "keine".
  "ig" = Ware (kein Dienst) von einer Firma aus einem anderen EU-Land ohne Umsatzsteuer → innergemeinschaftlicher Erwerb: ust = 0, netto = brutto, steuersatz = 20.
- Wenn ausländische Firmen trotzdem österreichische 20 % USt verrechnen (z. B. Amazon, Google, Microsoft mit österreichischer USt), ist das "vst".
- konto: Nummer aus dem Kontenrahmen. Häufige Konten:
${Object.entries(KONTEN_HAEUFIG).map(([k, v]) => `  ${k} ${v}`).join("\n")}
- Ein Gerät über 1.000 EUR netto ist ein Anlagegut: konto 580 (bzw. 630 beim Auto) und "anlage": true. Geräte bis 1.000 EUR netto: 680 oder das passende Aufwandskonto.
- garantie_monate: 24 bei gekauften Geräten und Waren mit Gewährleistung, sonst null.
- zahlungsart: "karte" bei Zahlung mit Karte oder Handy (VISA, Mastercard, Maestro, Debit, Kreditkarte, Bankomat, kontaktlos,
  Apple Pay, Google Pay, Kartennummer mit ****, Terminal- oder Autorisierungsnummer; italienisch Carta, Bancomat, Pagamento elettronico, POS;
  spanisch Tarjeta, Datáfono; französisch CB, Carte bancaire). "bar" bei Barzahlung (Bar, Barzahlung, gegeben, Rückgeld, Retour; Contanti,
  Efectivo, Espèces, Cash). "ueberweisung" bei Rechnungen, die per Überweisung, SEPA-Lastschrift, Einzug oder PayPal bezahlt werden oder
  online schon bezahlt sind. null, wenn auf dem Beleg nicht erkennbar.
- dokumentart: "beleg" bei Rechnung, Kassabon, Quittung oder Gutschrift (etwas wurde gekauft, bezahlt oder verrechnet).
  "behoerde" bei Post vom Finanzamt, der SVS bzw. Sozialversicherung, der Gemeinde oder der Kammer, die keine Rechnung ist:
  Bescheid, Benachrichtigung über Vorauszahlungen, Buchungsmitteilung, Beitragsvorschreibung, Kontoauszug des Abgabenkontos, Erinnerung.
  Bei "behoerde" bleiben "zeilen" leer und "behoerde" wird so ausgefüllt:
  { "stelle": "Finanzamt" oder "SVS" oder wer es geschickt hat,
    "titel": "kurz, z. B. Einkommensteuer-Vorauszahlung 2026, Einkommensteuerbescheid 2025, Beitragsvorschreibung 4. Quartal 2026",
    "steuerjahr": Jahr, um das es geht (Zahl),
    "est_vz_jahresbetrag": Jahresbetrag der Einkommensteuer-Vorauszahlung oder null,
    "naechste_zahlung": { "betrag": 0.00, "faellig": "JJJJ-MM-TT", "was": "kurz" } oder null,
    "svs_quartalsbetrag": Beitrag je Quartal laut SVS oder null,
    "abgabenkonto": { "stand": "JJJJ-MM-TT", "betrag": 0.00, "guthaben": true oder false } oder null }
- an_s1: true bei S1 Secure, S1 Secure e.U., S1Secure oder Jürgen (Erich) Schandl als Empfänger. false bei jeder anderen Firma oder Person
  als Empfänger, auch an derselben Adresse (z. B. Shootformance GmbH, Dagmar Schandl, ein Kunde). Dann in "empfaenger" genau diesen Namen.
- frage: nur ausfüllen, wenn etwas wirklich unklar ist (z. B. keine Steuer erkennbar, Beleg unleserlich, Rechnung an jemand anderen, privat oder geschäftlich unklar). Kurze Frage an Jürgen auf Deutsch.

Bisherige Zuordnungen dieses Unternehmens (Lieferant → Konto, Steuerart, wie oft):
Ist der Lieferant hier aufgeführt, buche ALLE Zeilen so wie bisher (gleiches Konto, gleiche Steuerart), auch Grund-, Abo- oder Servicegebühren
desselben Lieferanten (z. B. bei Easypark alles 7251 ohne Vorsteuer). Weiche nur ab, wenn der Beleg eindeutig etwas anderes ist, und schreib dann in "begruendung", warum.
${verlauf || "(noch keine)"}
${regelText(regeln)}`;
}

function zahl(v: unknown) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Post vom Finanzamt, der SVS oder einer anderen Stelle: kein Beleg, sondern Unterlage.
// Wird bei den Unterlagen des Jahres abgelegt, Steuerwerte werden nachgezogen, der Beleg verschwindet.
// deno-lint-ignore no-explicit-any
async function alsUnterlage(sb: any, row: any, r: any, person: string) {
  const b = r.behoerde || {};
  const heute = new Date().toISOString().slice(0, 10);
  const datum = ISO.test(r.datum || "") ? r.datum : heute;
  const sj = Number(b.steuerjahr);
  const jahr = sj >= 2000 && sj <= 2100 ? sj : Number(datum.slice(0, 4));
  const stelle = String(b.stelle || r.lieferant || "Behörde").slice(0, 60);
  const titel = String(b.titel || r.text || "Schreiben").slice(0, 120);
  const ext = String(row.datei).split(".").pop();
  const nz = b.naechste_zahlung && zahl(b.naechste_zahlung.betrag) > 0 && ISO.test(b.naechste_zahlung.faellig || "") ? { betrag: zahl(b.naechste_zahlung.betrag), faellig: b.naechste_zahlung.faellig, was: String(b.naechste_zahlung.was || "").slice(0, 80) } : null;
  const ak = b.abgabenkonto && ISO.test(b.abgabenkonto.stand || "") ? { stand: b.abgabenkonto.stand, betrag: Math.abs(zahl(b.abgabenkonto.betrag)), guthaben: !!b.abgabenkonto.guthaben } : null;
  const eintrag = {
    id: crypto.randomUUID(), jahr, pfad: row.datei, hash: (row.lesung && row.lesung.hash) || null, name: `${stelle} – ${titel}.${ext}`.replace(/[\\/:*?"<>|]+/g, "-"), am: heute,
    von: person === "j" ? "Jürgen" : person === "d" ? "Dagmar" : person, art: "behoerde", stelle, titel, datum,
    info: { naechste_zahlung: nz, est_vz_jahresbetrag: zahl(b.est_vz_jahresbetrag) || null, svs_quartalsbetrag: zahl(b.svs_quartalsbetrag) || null, abgabenkonto: ak },
  };
  const { data: u } = await sb.from("einstellungen").select("value").eq("key", "unterlagen").maybeSingle();
  const liste = Array.isArray(u && u.value) ? u.value : [];
  // dasselbe Schreiben schon abgelegt (z. B. einmal als PDF, einmal als Foto): nichts doppelt ablegen
  // deno-lint-ignore no-explicit-any
  const gleich = liste.find((x: any) => x && x.art === "behoerde" && String(x.stelle || "").toLowerCase() === stelle.toLowerCase() && x.datum === datum &&
    (String(x.titel || "").toLowerCase() === titel.toLowerCase() ||
      (nz && x.info && x.info.naechste_zahlung && zahl(x.info.naechste_zahlung.betrag) === nz.betrag && x.info.naechste_zahlung.faellig === nz.faellig)));
  if (gleich) {
    await sb.from("fragen").update({ erledigt: true, antwort: "Schon bei den Unterlagen abgelegt." }).eq("datensatz", row.id).eq("erledigt", false);
    const { error: eg } = await sb.from("belege").update({ storniert: true, notiz: "Doppelt: schon bei den Unterlagen abgelegt", lesung: { ...(row.lesung || {}), post: gleich.id } }).eq("gruppe", row.gruppe);
    if (eg) return { error: eg.message };
    return { ok: true, unterlage: gleich, schon: true, steuer: null, geaendert: [] };
  }
  liste.push(eintrag);
  const { error: e1 } = await sb.from("einstellungen").upsert({ key: "unterlagen", value: liste });
  if (e1) return { error: e1.message };

  // Steuerwerte nachziehen, aber nur mit Neuerem als dem, was schon drin ist
  const { data: s } = await sb.from("einstellungen").select("value").eq("key", "steuer").maybeSingle();
  const st = { ...((s && s.value) || {}) };
  const geaendert: string[] = [];
  const fa = /finanzamt/i.test(stelle), svs = /svs|sozialversicherung/i.test(stelle);
  const eur = (x: number) => x.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const jetzt = Number(heute.slice(0, 4));
  const vzJahr = zahl(b.est_vz_jahresbetrag);
  if (fa && vzJahr > 0 && vzJahr < 200000 && jahr === jetzt && vzJahr !== zahl(st.est_vz_jahr)) { st.est_vz_jahr = vzJahr; geaendert.push("ESt-Vorauszahlung im Jahr " + eur(vzJahr)); }
  if (fa && nz && /einkommensteuer/i.test(titel + " " + nz.was) && nz.faellig >= heute && nz.betrag !== zahl(st.est_vz_quartal)) { st.est_vz_quartal = nz.betrag; geaendert.push("nächste ESt-Vorauszahlung " + eur(nz.betrag)); }
  // SVS: für die Rücklage zählt, was je Quartal tatsächlich zu zahlen ist (Beitragsvorschreibung inkl. Nachbemessungen)
  const sq = svs && nz && /beitr|vorschreib/i.test(titel + " " + nz.was) ? nz.betrag : zahl(b.svs_quartalsbetrag);
  if (svs && sq > 0 && sq < 100000 && sq !== zahl(st.svs_quartal)) { st.svs_quartal = sq; geaendert.push("SVS je Quartal " + eur(sq)); }
  if (fa && ak && (!st.abgabenkonto_stand || ak.stand > st.abgabenkonto_stand)) { st.abgabenkonto_guthaben = ak.guthaben ? ak.betrag : 0; st.abgabenkonto_stand = ak.stand; geaendert.push("Abgabenkonto " + (ak.guthaben ? "Guthaben " + eur(ak.betrag) : "ohne Guthaben")); }
  if (geaendert.length) await sb.from("einstellungen").upsert({ key: "steuer", value: st });

  // Belege werden nie gelöscht: storniert und als Post markiert, die App blendet sie aus
  await sb.from("fragen").update({ erledigt: true, antwort: "Post vom Amt, bei den Unterlagen abgelegt." }).eq("datensatz", row.id).eq("erledigt", false);
  const { error: e2 } = await sb.from("belege").update({ storniert: true, notiz: "Post vom Amt, bei den Unterlagen abgelegt", lesung: { ...(row.lesung || {}), post: eintrag.id } }).eq("gruppe", row.gruppe);
  if (e2) return { error: e2.message };
  return { ok: true, unterlage: eintrag, steuer: geaendert.length ? st : null, geaendert };
}
const ARTEN = ["vst", "rc", "ig", "ausland", "keine"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: person } = await sb.rpc("my_person");
  if (!person) return json({ error: "Nicht angemeldet oder kein Zugang." }, 401);

  let body: { id?: string; ping?: boolean; bank?: { datum?: string; betrag?: number; name?: string } | null } = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  const { data: ki } = await sb.from("einstellungen").select("value").eq("key", "ki").maybeSingle();
  const modell = (ki && ki.value && ki.value.modell) || "claude-sonnet-5-5";
  if (body.ping) return json({ ok: !!key, modell, text: key ? "" : "Der API-Schlüssel ANTHROPIC_API_KEY ist in Supabase noch nicht hinterlegt." });
  if (!key) return json({ error: "Das automatische Lesen ist noch nicht eingerichtet (ANTHROPIC_API_KEY fehlt)." }, 503);
  if (!body.id) return json({ error: "Beleg fehlt." }, 400);

  const { data: row, error: e1 } = await sb.from("belege").select("*").eq("id", body.id).single();
  if (e1 || !row) return json({ error: "Beleg nicht gefunden." }, 404);
  if (!row.datei) return json({ error: "Der Beleg hat keine Datei." }, 400);
  const { data: file, error: e2 } = await sb.storage.from("belege").download(row.datei);
  if (e2 || !file) return json({ error: "Datei nicht gefunden." }, 404);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = String(row.datei).split(".").pop()!.toLowerCase();
  const media = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "heic" ? "image/heic" : "image/jpeg";
  if (media === "image/heic") return json({ error: "HEIC-Fotos kann die App nicht lesen. Bitte als JPG fotografieren." }, 415);

  // bisherige Zuordnungen: je Lieferant, welche Konten und Steuerarten wie oft (bestätigt, nicht privat)
  const { data: alt } = await sb.from("belege").select("lieferant, konto, text, steuerart, steuersatz, datum, status").eq("bestaetigt", true).eq("storniert", false).neq("lieferant", "").order("datum", { ascending: false }).limit(2000);
  const proL = new Map<string, { name: string; text: string; paare: Map<string, number> }>();
  for (const a of alt || []) {
    if (!a.konto || a.status === "privat") continue;
    const k = String(a.lieferant).toLowerCase();
    let e = proL.get(k);
    if (!e) { if (proL.size >= 150) continue; e = { name: a.lieferant, text: a.text, paare: new Map() }; proL.set(k, e); }
    const p = `${a.konto}, ${a.steuerart}${a.steuersatz && a.steuerart !== "keine" ? " " + a.steuersatz + " %" : ""}`;
    e.paare.set(p, (e.paare.get(p) || 0) + 1);
  }
  const verlauf = [...proL.values()].map((e) => `${e.name} → ${[...e.paare.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([p, n]) => `${p} (${n}×)`).join("; ")} – zuletzt: ${e.text}`);

  const { data: rg } = await sb.from("einstellungen").select("value").eq("key", "regeln").maybeSingle();
  // deno-lint-ignore no-explicit-any
  const regeln: any[] = Array.isArray(rg && rg.value) ? rg.value.filter((x: any) => x && x.lieferant) : [];

  const content = [
    media === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: media, data: encodeBase64(bytes) } }
      : { type: "image", source: { type: "base64", media_type: media, data: encodeBase64(bytes) } },
    { type: "text", text: prompt(verlauf.join("\n"), body.bank || null, regeln) },
  ];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: modell, max_tokens: 3000, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) {
    const t = await res.text();
    return json({ error: `Claude antwortet nicht wie erwartet (HTTP ${res.status}).`, detail: t.slice(0, 400) }, 502);
  }
  const out = await res.json();
  const text = (out.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
  const m = text.match(/\{[\s\S]*\}/);
  // deno-lint-ignore no-explicit-any
  let r: any;
  try { r = JSON.parse(m ? m[0] : text); } catch (_) { return json({ error: "Die Antwort war kein gültiges JSON.", detail: text.slice(0, 300) }, 502); }

  // Post von Finanzamt oder SVS (nicht beim Zuordnen zu einer Bankbuchung): als Unterlage ablegen
  if (r.dokumentart === "behoerde" && !body.bank && !row.nr) {
    const { data: verb } = await sb.from("bank").select("id").eq("beleg_gruppe", row.gruppe).limit(1);
    if (!verb || !verb.length) {
      const erg = await alsUnterlage(sb, row, r, String(person));
      return json(erg, erg.error ? 500 : 200);
    }
  }

  // Zeilen säubern: netto + ust = brutto, Steuerart gültig, Auto ohne Vorsteuer
  // deno-lint-ignore no-explicit-any
  let zeilen = (Array.isArray(r.zeilen) ? r.zeilen : []).map((z: any) => {
    let art = ARTEN.includes(z.steuerart) ? z.steuerart : "vst";
    const konto = Number(z.konto) || null;
    const brutto = zahl(z.brutto);
    let ust = zahl(z.ust);
    if (konto && L.kfz(konto) && art === "vst") art = "keine";
    if (art !== "vst") ust = 0;
    const satz = art === "vst" || art === "rc" || art === "ig" || art === "ausland" ? (Number(z.steuersatz) || (art === "vst" ? 20 : art === "ausland" ? null : 20)) : null;
    return { konto, text: String(z.text || r.text || "").slice(0, 200), brutto, ust, netto: zahl(brutto - ust), steuerart: art, steuersatz: satz, privat: z.privat === true };
  }).filter((z: { brutto: number }) => z.brutto !== 0);
  if (!zeilen.length) zeilen = [{ konto: null, text: String(r.text || ""), brutto: 0, ust: 0, netto: 0, steuerart: "vst", steuersatz: 20, privat: false }];

  // besondere Regel für diesen Lieferanten sicherstellen: nur die Zeilen mit dem Namen sind geschäftlich
  // eine Regel kann erst ab einem Datum gelten (z. B. ab 1.1.2027): davor alles wie bisher, nichts privat
  const fuerLieferant = regeln.filter((x) => L.aehnlich(x.lieferant, r.lieferant || ""));
  const regel = fuerLieferant.find((x) => !x.ab || (ISO.test(r.datum || "") && r.datum >= x.ab));
  if (fuerLieferant.length && !regel) zeilen.forEach((z: { privat: boolean }) => { z.privat = false; });
  let regelFrage: string | null = null;
  if (regel && regel.nur) {
    const nz = (t: string) => String(t || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
    const nur = nz(regel.nur);
    const mit = zeilen.filter((z: { text: string }) => nz(z.text).includes(nur));
    if (mit.length) zeilen.forEach((z: { text: string; privat: boolean }) => { z.privat = !nz(z.text).includes(nur); });
    else regelFrage = `Regel für ${regel.lieferant}: nur ${regel.nur} ist geschäftlich, aber die App hat die Position von ${regel.nur} nicht gefunden. Bitte aufteilen.`;
  }

  // doppelt? gleiche Rechnungsnummer (beim Beleg oder im Kontoauszug) oder gleicher Lieferant mit gleichem Betrag kurz danach
  const brutto = zahl(zeilen.reduce((n: number, z: { brutto: number }) => n + z.brutto, 0));
  const SEL = "gruppe, jahr, monat, nr, lieferant, datum, brutto, rechnungsnr";
  // deno-lint-ignore no-explicit-any
  let treffer: any = null;
  const rnr = r.rechnungsnr ? String(r.rechnungsnr).replace(/["\\%,()*]/g, "").trim() : "";
  if (rnr.length >= 4) {
    const { data: k1 } = await sb.from("belege").select(SEL).neq("gruppe", row.gruppe).eq("storniert", false).eq("rechnungsnr", rnr).limit(5);
    treffer = (k1 || []).find((k) => L.aehnlich(k.lieferant, r.lieferant)) || null;
    if (!treffer && rnr.length >= 6) {
      // Rechnungsnummer im Buchungstext: nur als ganze Nummer (nicht "1/2026" in "U 01/2026") und nur beim selben Lieferanten
      const ganz = new RegExp(`(^|[^0-9A-Za-z])${rnr.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}($|[^0-9A-Za-z])`, "i");
      const { data: b1 } = await sb.from("bank").select("beleg_gruppe, info").not("beleg_gruppe", "is", null).ilike("info", `%${rnr}%`).limit(5);
      for (const b of b1 || []) {
        if (b.beleg_gruppe === row.gruppe || !ganz.test(String(b.info || ""))) continue;
        const { data: g } = await sb.from("belege").select(SEL).eq("gruppe", b.beleg_gruppe).eq("storniert", false).limit(1);
        if (g && g[0] && L.aehnlich(g[0].lieferant, r.lieferant)) { treffer = g[0]; break; }
      }
    }
  }
  if (!treffer && /^\d{4}-\d{2}-\d{2}$/.test(r.datum || "") && brutto > 0) {
    const tag = (n: number) => { const [y, mo, d] = String(r.datum).split("-").map(Number); return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10); };
    const { data: k2 } = await sb.from("belege").select(SEL).neq("gruppe", row.gruppe).eq("storniert", false).gte("datum", tag(-10)).lte("datum", tag(45)).gte("brutto", brutto - 0.01).lte("brutto", brutto + 0.01).limit(20);
    treffer = (k2 || []).find((k) => L.aehnlich(k.lieferant, r.lieferant)) || null;
  }
  const doppelt = treffer ? `${treffer.lieferant} vom ${L.datum(treffer.datum)} über ${L.eur(treffer.brutto)} (${treffer.nr ? "Beleg " + treffer.nr + "/" + String(treffer.jahr).slice(2) : L.MONATE[treffer.monat] + ", noch ohne Nummer"})` : null;
  const doppeltGruppe = treffer ? treffer.gruppe : null;

  let frage = r.frage ? String(r.frage) : regelFrage;
  const fremd = r.an_s1 === false ? String(r.empfaenger || "jemand anderen").slice(0, 120) : null;
  if (fremd) frage = `Die Rechnung geht an ${fremd}, nicht an S1 Secure. Falsch hineingezogen?`;
  const garantie = r.garantie_monate && r.datum ? (() => { const [y, mo, d] = String(r.datum).split("-").map(Number); const g = new Date(Date.UTC(y, mo - 1 + Number(r.garantie_monate), d)); return g.toISOString().slice(0, 10); })() : null;
  // wie bezahlt: Karte oder Überweisung läuft über das Konto, sonst bar; nicht erkennbar = wie bisher
  const za = String(r.zahlungsart || "").toLowerCase();
  const { data: verbunden } = await sb.from("bank").select("id").eq("beleg_gruppe", row.gruppe).limit(1);
  const zahlung = body.bank || (verbunden && verbunden.length) ? "bank" : za === "bar" ? "bar" : (za === "karte" || za === "ueberweisung") ? "bank" : row.zahlung;
  const gemeinsam = {
    zahlung,
    datum: /^\d{4}-\d{2}-\d{2}$/.test(r.datum || "") ? r.datum : null,
    lieferant: String(r.lieferant || "").slice(0, 120),
    rechnungsnr: r.rechnungsnr ? String(r.rechnungsnr).slice(0, 80) : null,
    lieferant_uid: r.lieferant_uid ? String(r.lieferant_uid).replace(/\s/g, "").slice(0, 30) : null,
    land: r.land ? String(r.land).slice(0, 2).toUpperCase() : null,
    waehrung: r.waehrung ? String(r.waehrung).slice(0, 3).toUpperCase() : "EUR",
    volltext: r.volltext ? String(r.volltext).slice(0, 4000) : null,
    anlage: !!r.anlage || zeilen.some((z: { netto: number; konto: number | null }) => z.netto > 1000 && z.konto !== null && z.konto < 1000),
    garantie_bis: garantie,
    bestaetigt: false,
    status: frage ? "unklar" : row.status,
    lesung: { ...(row.lesung || {}), ki: { ...r, zeilen: undefined, volltext: undefined, frage, doppelt, doppelt_gruppe: doppeltGruppe, regel: regel ? `${regel.lieferant}: ${regel.nur ? "nur " + regel.nur + " geschäftlich, der Rest privat" : ""}${regel.nur && regel.text ? ". " : ""}${regel.text || ""}` : null }, modell, zeit: new Date().toISOString() },
  };
  // privat ist keine Spalte: als Status der Zeile speichern
  const ohne = (z: Record<string, unknown>) => { const { privat, ...rest } = z; return { ...rest, status: privat ? "privat" : gemeinsam.status }; };
  const erste = ohne(zeilen[0]);
  // neu gelesen: frühere Zusatzzeilen derselben Rechnung ersetzen
  await sb.from("belege").update({ storniert: true, notiz: "beim Neu-Lesen ersetzt" }).eq("gruppe", row.gruppe).neq("id", row.id).eq("storniert", false);
  const { error: e3 } = await sb.from("belege").update({ ...gemeinsam, ...erste }).eq("id", row.id);
  if (e3) return json({ error: e3.message }, 500);
  if (zeilen.length > 1) {
    const extra = zeilen.slice(1).map((z: Record<string, unknown>) => ({
      ...gemeinsam, ...ohne(z), jahr: row.jahr, monat: row.monat, gruppe: row.gruppe, zahlung, datei: row.datei, quelle: row.quelle,
    }));
    const { error: e4 } = await sb.from("belege").insert(extra);
    if (e4) return json({ error: e4.message }, 500);
  }
  if (frage) await sb.from("fragen").insert({ tabelle: "belege", datensatz: row.id, jahr: row.jahr, monat: row.monat, text: frage, von: "app", an: "j" });
  return json({ ok: true, zeilen: zeilen.length, brutto, doppelt, doppelt_gruppe: doppeltGruppe, frage, zahlung, fremd });
});
