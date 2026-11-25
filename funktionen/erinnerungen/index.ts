// S1 Tax: Erinnerungen aufs Handy
// Läuft alle 15 Minuten (Zeitplan in der Datenbank). Schickt jede Erinnerung nur einmal:
// UVA und Steuertermine, überfällige Rechnungen, Rückfragen zwischen Jürgen und Dagmar,
// geprüfte Monate, Garantie- und Abo-Enden, fehlender Kontoauszug.
// Legt am Monatsanfang die Entwürfe für IFMS und ÖGK an.
// Die Schlüssel für die Mitteilungen erzeugt der Dienst beim ersten Lauf selbst.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import "./logic.js";

// Rechenlogik: genau dieselbe Datei wie in der App (js/logic.js), fest auf einen Stand im Repo gebunden
// und per Prüfsumme gesichert. Nach jeder Änderung an js/logic.js hier Stand und Prüfsumme nachziehen.
// Klappt das Laden nicht, bleibt nur der alte Auszug (logic.js hier) – dann keine Erinnerungen mit Beträgen.
const LOGIK = { commit: "c455693a8bb84ba5446ecbde023a087d871cb19f", sha256: "65384c71e6d5ab84b519ef92885c917c7927d2dba023d7a7b9d27ced17629de9" };
// deno-lint-ignore no-explicit-any
const G = globalThis as any;
// deno-lint-ignore no-explicit-any
let L: any = G.L, logik = "auszug", logikFehler: string | null = null;
async function ladeLogik() {
  if (logik === "app") return;
  try {
    const r = await fetch(`https://raw.githubusercontent.com/JuergenSchandl/s1-tax/${LOGIK.commit}/js/logic.js`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const buf = await r.arrayBuffer();
    const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf))).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (h !== LOGIK.sha256) throw new Error("Prüfsumme passt nicht");
    // deno-lint-ignore no-explicit-any
    const m: any = { exports: {} };
    new Function("module", new TextDecoder().decode(buf))(m);
    if (!m.exports || typeof m.exports.termine !== "function" || typeof m.exports.uva !== "function") throw new Error("Rechenlogik unvollständig");
    L = m.exports; logik = "app"; logikFehler = null;
  } catch (e) {
    logikFehler = String((e && (e as Error).message) || e).slice(0, 120);
    console.error("Rechenlogik der App nicht geladen:", logikFehler);
  }
}
// wie in js/rechnung.js der App: Vorlagentext füllen und Summen rechnen
const R = {
  fuellen(text: string, felder: Record<string, string>) {
    return String(text || "").replace(/\{(\w+)\}/g, (_all, k) => { const v = felder[k]; if (!v) return "…"; return k === "termine" ? v : "**" + v + "**"; }).split("** bis **").join(" bis ");
  },
  summen(pos: { menge: number; preis: number }[], satz = 20) {
    const netto = Math.round(pos.reduce((n, p) => n + Math.round((Number(p.menge) || 0) * (Number(p.preis) || 0) * 100) / 100, 0) * 100) / 100;
    const ust = Math.round(netto * satz) / 100;
    return { netto, ust, brutto: Math.round((netto + ust) * 100) / 100 };
  },
};
const APP = "https://juergenschandl.github.io/s1-tax/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function wien(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { tag: `${p.year}-${p.month}-${p.day}`, stunde: Number(p.hour) % 24 };
}

// deno-lint-ignore no-explicit-any
async function vapid(sb: any) {
  const { data } = await sb.from("push_keys").select("public_key, private_key").eq("id", 1).maybeSingle();
  if (data) return data;
  const k = webpush.generateVAPIDKeys();
  await sb.from("push_keys").upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
  return (await sb.from("push_keys").select("public_key, private_key").eq("id", 1).single()).data;
}
// deno-lint-ignore no-explicit-any
async function senden(sb: any, wer: string[], msg: Record<string, string>) {
  const { data: subs } = await sb.from("push_subs").select("endpoint, sub").in("person", wer);
  let n = 0;
  for (const s of subs || []) {
    try { await webpush.sendNotification(s.sub, JSON.stringify(msg), { TTL: 86400 }); n++; }
    catch (e) {
      // deno-lint-ignore no-explicit-any
      const c = (e as any)?.statusCode;
      if (c === 404 || c === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
      else console.error("push", c);
    }
  }
  return n;
}
// deno-lint-ignore no-explicit-any
async function einmal(sb: any, key: string) {
  const { error } = await sb.from("push_log").insert({ key });
  return !error;
}
// deno-lint-ignore no-explicit-any
async function alle(sb: any, table: string) {
  let out: unknown[] = [], from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select("*").range(from, from + 999);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < 1000) return out;
    from += 1000;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  await ladeLogik();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const keys = await vapid(sb);
  const url = new URL(req.url);
  if (url.searchParams.has("key")) return json({ publicKey: keys.public_key });
  webpush.setVapidDetails("mailto:office@s1secure.at", keys.public_key, keys.private_key);

  // Aufruf aus der App: nur angemeldete Mitglieder
  let ich: string | null = null;
  if (url.searchParams.has("test") || url.searchParams.has("jetzt")) {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    if (!u || !u.user) return json({ error: "Nicht angemeldet" }, 401);
    const { data: m } = await sb.from("members").select("person").eq("user_id", u.user.id).maybeSingle();
    if (!m) return json({ error: "Kein Zugang" }, 403);
    ich = m.person;
  }
  if (url.searchParams.has("test")) {
    const sent = await senden(sb, [ich!], { title: "S1 Tax", body: "Mitteilungen sind eingeschaltet.", url: APP, tag: "s1tax-test" });
    return json({ sent });
  }

  const { tag, stunde } = wien();
  L.heute = () => tag;
  const D = {
    belege: await alle(sb, "belege"), bank: await alle(sb, "bank"), ausgang: await alle(sb, "ausgang"), kunden: await alle(sb, "kunden"),
    monate: await alle(sb, "monate"), fragen: await alle(sb, "fragen"), members: await alle(sb, "members"),
    // deno-lint-ignore no-explicit-any
    einst: Object.fromEntries(((await alle(sb, "einstellungen")) as any[]).map((x) => [x.key, x.value])),
  };
  // deno-lint-ignore no-explicit-any
  for (const t of ["belege", "bank", "ausgang", "monate"]) for (const r of (D as any)[t]) for (const k of ["netto", "ust", "brutto", "steuersatz", "betrag", "bezahlt_betrag", "uva_zahllast", "uva_bezahlt"]) if (typeof r[k] === "string") r[k] = Number(r[k]);
  // Stand der Rechenlogik festhalten: die App vergleicht ihn mit ihrer eigenen und warnt bei Abweichung
  const stand = { logik, sha256: logik === "app" ? LOGIK.sha256 : null, commit: logik === "app" ? LOGIK.commit : null, fehler: logikFehler };
  // deno-lint-ignore no-explicit-any
  const altStand: any = (D.einst.dienst || {}).erinnerungen || {};
  if (altStand.logik !== stand.logik || altStand.sha256 !== stand.sha256 || (altStand.fehler || null) !== stand.fehler) {
    await sb.from("einstellungen").upsert({ key: "dienst", value: { ...(D.einst.dienst || {}), erinnerungen: { ...stand, am: tag } } });
  }
  // deno-lint-ignore no-explicit-any
  const name = (p: string) => ((D.members as any[]).find((m) => m.person === p) || {}).name || (p === "j" ? "Jürgen" : p === "d" ? "Dagmar" : "App");
  let gesendet = 0;
  // nur merken, was wirklich an ein Gerät ging: ohne eingeschaltetes Handy geht keine Erinnerung verloren
  const { data: geraete } = await sb.from("push_subs").select("person");
  const schick = async (key: string, wer: string[], title: string, body: string, ziel = "") => {
    if (!(geraete || []).some((g: { person: string }) => wer.includes(g.person))) return;
    if (!(await einmal(sb, key))) return;
    gesendet += await senden(sb, wer, { title, body, url: APP + (ziel ? "#" + ziel : ""), tag: key.split("|")[0] });
  };

  // Rückfragen und Antworten: sofort, auch nachts nicht (erst ab 7 Uhr)
  if (stunde >= 7 || ich) {
    // deno-lint-ignore no-explicit-any
    for (const f of D.fragen as any[]) {
      if (f.erledigt) continue;
      const an = f.an || (f.von === "j" ? "d" : "j");
      if (!f.antwort) await schick(`frage|${f.id}`, [an], f.von === "app" ? "S1 Tax hat eine Frage" : `Frage von ${name(f.von)}`, String(f.text).slice(0, 180), "fragen");
      else if (f.von !== "app") await schick(`antwort|${f.id}`, [f.von], `Antwort von ${name(f.antwort_von)}`, String(f.antwort).slice(0, 180), "fragen");
    }
    // deno-lint-ignore no-explicit-any
    for (const m of D.monate as any[]) {
      if (m.geprueft_am && m.geprueft_von && m.geprueft_von !== "j") await schick(`geprueft|${m.jahr}-${m.monat}|${m.geprueft_am}`, ["j"], `${L.MONATE[m.monat]} geprüft`, `${name(m.geprueft_von)} hat ${L.MONATE[m.monat]} ${m.jahr} geprüft.`, `monat/${m.jahr}-${m.monat}`);
      if (m.nach_pruefung_geaendert && m.geprueft_von && m.geprueft_von !== "j") await schick(`geaendert|${m.jahr}-${m.monat}|${m.geprueft_am}`, [m.geprueft_von], `${L.MONATE[m.monat]} geändert`, `Nach deiner Prüfung wurde in ${L.MONATE[m.monat]} ${m.jahr} etwas geändert.`, `monat/${m.jahr}-${m.monat}`);
    }
  }
  if (ich) return json({ sofort: true, gesendet });
  if (stunde < 8 || stunde > 20) return json({ tag, stunde, ruhe: true });

  const j = Number(tag.slice(0, 4)), mo = Number(tag.slice(5, 7)), d = Number(tag.slice(8, 10));

  // UVA: 5 Tage vorher, am Vortag, am Tag (nur mit der Rechenlogik der App, sonst lieber keine als falsche Beträge)
  for (let i = -3; i <= -1 && logik === "app"; i++) {
    const x = L.monatPlus(j, mo, i), u = L.uva(D, x.jahr, x.monat), t = L.tageBis(u.faellig);
    if (u.erledigt || ![5, 1, 0].includes(t)) continue;
    const was = u.zahllast < 0 ? `Gutschrift ${L.eur(-u.zahllast)} melden` : u.gemeldet ? `${L.eur(u.zahllast)} überweisen` : `${L.eur(u.zahllast)} melden und überweisen`;
    await schick(`uva|${x.jahr}-${x.monat}|${t}`, ["j"], `UVA ${L.MONATE[x.monat]}`, `${was}, ${t === 0 ? "heute fällig" : t === 1 ? "morgen fällig" : "fällig am " + L.datum(u.faellig)}.`, `uva/${x.jahr}-${x.monat}`);
  }
  // ESt-Vorauszahlung und SVS
  for (const t of logik === "app" ? L.termine(D, j) : []) {
    if (t.art === "uva" || t.erledigt) continue;
    const tb = L.tageBis(t.datum);
    if ([5, 0].includes(tb)) await schick(`termin|${t.art}|${t.datum}|${tb}`, ["j"], t.titel, `${L.eur(t.betrag)} ${tb === 0 ? "heute fällig" : "fällig am " + L.datum(t.datum)}.`, "steuer");
  }
  // überfällige Rechnungen: am Tag nach dem Ziel, dann wöchentlich
  // deno-lint-ignore no-explicit-any
  for (const a of D.ausgang as any[]) {
    if (!L.offen(a)) continue;
    const t = -L.tageBis(L.faelligAm(a));
    if (t >= 1 && (t === 1 || t % 7 === 1)) await schick(`rg|${a.id}|${t}`, ["j"], `Rechnung ${a.nr} offen`, `${a.kunde}: ${L.eur(a.brutto)}, seit ${t} ${t === 1 ? "Tag" : "Tagen"} überfällig.`, `rechnung/${a.id}`);
  }
  // Garantie und Jahresabos 30 Tage vorher
  // deno-lint-ignore no-explicit-any
  for (const b of D.belege as any[]) if (b.garantie_bis && !b.storniert && L.tageBis(b.garantie_bis) === 30) await schick(`garantie|${b.gruppe}`, ["j"], "Garantie endet", `${b.lieferant} ${b.text}: Garantie endet am ${L.datum(b.garantie_bis)}.`, "anlagen");
  // deno-lint-ignore no-explicit-any
  for (const a of (D.einst.jahresabos || []) as any[]) if (a.verlaengerung && L.tageBis(a.verlaengerung) === 30) await schick(`abo|${a.name}|${a.verlaengerung}`, ["j"], "Abo verlängert sich", `${a.name} (${L.eur(a.betrag)}) verlängert sich am ${L.datum(a.verlaengerung)}. Noch gebraucht?`, "abos");
  // Kontoauszug des Vormonats fehlt (ab dem 3.)
  const vm = L.monatPlus(j, mo, -1);
  // deno-lint-ignore no-explicit-any
  if (d >= 3 && !(D.bank as any[]).some((b) => b.jahr === vm.jahr && b.monat === vm.monat)) await schick(`auszug|${vm.jahr}-${vm.monat}|${d >= 8 ? 2 : 1}`, ["j"], "Kontoauszug einlesen", `Der N26-Auszug für ${L.MONATE[vm.monat]} fehlt noch. Ohne ihn stimmt die UVA nicht.`, `bank/${vm.jahr}-${vm.monat}`);

  // Entwürfe am Monatsanfang (IFMS, ÖGK)
  let entwuerfe = 0;
  if (d <= 5) {
    // deno-lint-ignore no-explicit-any
    for (const v of (D.einst.vorlagen || []) as any[]) {
      if (!v.auto || !v.kunde) continue;
      // deno-lint-ignore no-explicit-any
      const k = (D.kunden as any[]).find((x) => x.kurz === v.kunde);
      if (!k || !k.aktiv) continue;
      if (!(await einmal(sb, `entwurf|${v.id}|${vm.jahr}-${vm.monat}`))) continue;
      const mon3 = ["", "Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][vm.monat];
      const ende = L.monatsEnde(vm.jahr, vm.monat);
      const felder = { von: `01.${L.p2(vm.monat)}.${vm.jahr}`, bis: L.datum(ende), zeitraum: `01. ${mon3} – ${ende.slice(8)}. ${mon3}. ${vm.jahr}`, termine: "", km: "", strecke: "", leistungszeitraum: "" };
      // deno-lint-ignore no-explicit-any
      const pos = v.positionen.map((p: any) => ({ text: R.fuellen(p.text, felder), menge: p.menge, preis: p.preis, vorlage: p.text }));
      const s = R.summen(pos);
      const datum = `${j}-${L.p2(mo)}-01`;
      const { error } = await sb.from("ausgang").insert({
        jahr: j, datum, kunde_id: k.id, kunde: k.kurz, vorlage: v.id, entwurf: true, quelle: "auto", ziel: k.ziel || 14,
        empfaenger: { name1: k.name1, name2: k.name2, name2Bold: true, strasse: k.strasse, ort: k.ort, mail: k.mail, bestellnr: k.bestellnr, ansprech: k.ansprech, uid: k.uid, felder },
        positionen: pos, zeitraum: v.id === "ifms" ? `${felder.von} – ${felder.bis}` : felder.zeitraum, netto: s.netto, ust: s.ust, brutto: s.brutto,
        created_by: "app", updated_by: "app",
      });
      if (!error) { entwuerfe++; await schick(`entwurf-info|${v.id}|${vm.jahr}-${vm.monat}`, ["j"], `Rechnung ${v.kunde} bereit`, `Der Entwurf für ${L.MONATE[vm.monat]} (${L.eur(s.brutto)}) liegt bereit. Prüfen und ausstellen.`, "ausgang"); }
      else console.error("entwurf", error.message);
    }
  }
  return json({ tag, stunde, logik, logikFehler, gesendet, entwuerfe });
});
