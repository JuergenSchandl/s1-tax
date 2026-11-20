# S1 Tax

Buchhaltungs-App für **S1 Secure e.U.**: Belege (PDF und Foto), Bankabgleich mit N26,
Umsatzsteuer-Voranmeldung, Steuertermine, Ausgangsrechnungen und das Jahrespaket für CNC.

Die App läuft als Web-App auf GitHub Pages: https://juergenschandl.github.io/s1-tax/
Am Handy: im Browser öffnen und „Zum Home-Bildschirm“ wählen.

## Wo liegen die Daten?

**Nicht in diesem Repository.** Alle Buchungen, Belege und Rechnungen liegen in Supabase
(Projekt `s1-tax`, Region Frankfurt). Zugriff haben nur die zwei Konten in der Tabelle
`members` (Jürgen und Dagmar); alle anderen sehen nichts, auch wenn sie diese Seite aufrufen.
Der Schlüssel in `config.js` ist öffentlich gedacht, der Schutz liegt in den Zugriffsregeln
der Datenbank.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `app.css` | Grundgerüst und Aussehen |
| `js/core.js` | Verbindung zur Datenbank, Navigation, Dialoge |
| `js/logic.js` | Rechenlogik: UVA (Istbesteuerung), Termine, Rücklage, Jahresvorschau, Bankabgleich, Abos, Excel für CNC |
| `js/belege.js` | Monate und Belege, Hochladen, Beleg bearbeiten, Monatsabschluss, Rückfragen |
| `js/bank.js` | N26-Kontoauszug (PDF oder CSV) einlesen und zuordnen |
| `js/steuer.js` | Umsatzsteuer und Steuertermine |
| `js/ausgang.js` | Ausgangsrechnungen, Rechnungsnummern, Kunden |
| `js/rechnung.js` | Rechnung als PDF im Layout der Word-Vorlage |
| `js/n26.js` | Kontoauszug lesen (PDF-Text oder CSV) |
| `js/xlsx.js` | Excel-Dateien schreiben (Monats-Excel, Rechnungsnummern) |
| `js/speicher.js` | Warteschlange ohne Netz, Sicherung in OneDrive, Mitteilungen, Passkey |
| `js/weitere.js` | Übersicht, Abos, Anlagen, Suche, Jahrespaket, Einstellungen, Anmeldung |
| `js/konten.js` | Kontenrahmen von CNC |
| `js/lib/` | JSZip, pdf-lib, pdf.js (unverändert übernommen) |
| `funktionen/beleg-lesen` | Supabase Edge Function: liest Belege mit Claude (Secret `ANTHROPIC_API_KEY`) |
| `funktionen/erinnerungen` | Supabase Edge Function: Mitteilungen aufs Handy, Entwürfe am Monatsanfang |
| `datenbank/` | Zeitplan für die Erinnerungen |
| `sw.js` | Hintergrunddienst (ohne Netz starten, Mitteilungen anzeigen, Teilen vom Handy) |

Die beiden Edge Functions bekommen beim Hochladen zusätzlich `js/logic.js` (und `js/rechnung.js`)
mit, damit App und Dienst gleich rechnen.

## Einrichtung (einmalig)

1. Supabase → Authentication → Users: die zwei Konten anlegen, „Allow new users to sign up“ aus.
2. Supabase → Edge Functions → Secrets: `ANTHROPIC_API_KEY` eintragen (für das Lesen der Belege).
3. Supabase → Authentication → Passkeys: einschalten, Relying Party ID `juergenschandl.github.io`,
   Origin `https://juergenschandl.github.io`.
4. GitHub → Settings → Pages: Branch `main`, Ordner `/` (root).
