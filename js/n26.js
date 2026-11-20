/* S1 Tax · N26-Kontoauszug lesen
   Aus dem PDF (Text mit Position je Zeile) oder aus dem CSV-Export der N26-App werden
   die Buchungen eines Monats. Beim PDF prüft die App die Summe gegen den alten und
   neuen Kontostand, damit keine Buchung verloren geht. */
(function (root) {
  'use strict';

  var HEAD = /^(\S.*?)\s{2,}(\d{2}\.\d{2}\.\d{4})\s+([+-][\d.]+,\d{2})\s*€\s*$/;
  var TYPES = ['Belastungen', 'Lastschriften', 'Gutschriften', 'Überweisungen', 'Einzahlungen'];

  function num(s) { return Number(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.+-]/g, '')); }
  function iso(dmy) { var p = dmy.split('.'); return p[2] + '-' + p[1] + '-' + p[0]; }

  /* pdf.js liefert Textstücke mit x/y; daraus werden Zeilen wie bei "pdftotext -layout" */
  function linesFromItems(items) {
    var rows = [];
    items.forEach(function (it) {
      if (!it.str || !it.str.trim()) return;
      var y = it.y, row = null;
      for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) < 2.5) { row = rows[i]; break; }
      if (!row) { row = { y: y, parts: [] }; rows.push(row); }
      row.parts.push(it);
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });
      var out = '', end = null;
      r.parts.forEach(function (p) {
        if (end !== null) {
          var gap = p.x - end;
          if (gap > 12) out += '   ';
          else if (gap > 1.2 && !/\s$/.test(out) && !/^\s/.test(p.str)) out += ' ';
        }
        out += p.str;
        end = p.x + (p.w || 0);
      });
      return out.replace(/\s+$/, '');
    });
  }

  /* pages: Array von Zeilen-Arrays (eine Seite = Liste von Textzeilen) */
  function parseStatement(pages) {
    var tx = [], cur = null, summary = null, monat = null, von = null, bis = null;
    pages.forEach(function (lines) {
      var first = (lines.find(function (l) { return l.trim(); }) || '').trim();
      var mNr = first.match(/^(Kontoauszug|Zusammenfassung) Nr\. (\d{2})\/(\d{4})/);
      if (!mNr) { if (cur) { tx.push(cur); cur = null; } return; }
      if (!monat) monat = { monat: Number(mNr[2]), jahr: Number(mNr[3]) };
      lines.forEach(function (l) {
        var r = l.trim().match(/^(\d{2}\.\d{2}\.\d{4}) bis (\d{2}\.\d{2}\.\d{4})$/);
        if (r && !von) { von = iso(r[1]); bis = iso(r[2]); }
      });
      if (mNr[1] === 'Zusammenfassung') {
        if (summary) return;
        summary = {};
        lines.forEach(function (l) {
          var s = l.trim(), m;
          if ((m = s.match(/^Dein alter Kontostand\s+([+-]?[\d.]+,\d{2})€/))) summary.alt = num(m[1]);
          if ((m = s.match(/^Dein neuer Kontostand\s+([+-]?[\d.]+,\d{2})€/))) summary.neu = num(m[1]);
          if ((m = s.match(/^Ausgehende Transaktionen\s+([+-]?[\d.]+,\d{2})€/))) summary.aus = num(m[1]);
          if ((m = s.match(/^Einkommende Transaktionen\s+([+-]?[\d.]+,\d{2})€/))) summary.ein = num(m[1]);
        });
        return;
      }
      var inBody = false;
      lines.forEach(function (ln) {
        var s = ln.trim();
        if (!inBody) { if (/^Beschreibung\s+Verbuchungsdatum\s+Betrag$/.test(s)) inBody = true; return; }
        if (/Erstellt am\s*$/.test(s)) { inBody = false; return; }
        var m = ln.match(HEAD) || s.match(HEAD);
        if (m) {
          if (cur) tx.push(cur);
          cur = { name: m[1].trim(), datum: iso(m[2]), betrag: num(m[3]), info: [] };
          return;
        }
        if (!s || !cur) return;
        if (/^Wertstellung/.test(s)) { tx.push(cur); cur = null; return; }
        cur.info.push(s.replace(/\s{2,}/g, ' '));
      });
    });
    if (cur) tx.push(cur);
    tx.forEach(function (t) {
      t.typ = t.info.find(function (x) { return /Mastercard/.test(x) || TYPES.indexOf(x) >= 0; }) || '';
      var rest = t.info.filter(function (x) { return x !== t.typ && !/^IBAN/.test(x); });
      t.info = [t.typ].concat(rest).filter(Boolean).join(' · ');
    });
    var sum = Math.round(tx.reduce(function (n, t) { return n + t.betrag; }, 0) * 100) / 100;
    var ok = summary && summary.alt != null && summary.neu != null ? Math.abs(summary.alt + sum - summary.neu) < 0.005 : null;
    return { monat: monat, von: von, bis: bis, buchungen: tx, summe: sum, zusammenfassung: summary, stimmt: ok };
  }

  /* CSV aus der N26-App oder dem Webbanking (deutsch oder englisch, alte und neue Spalten) */
  function parseCsv(text) {
    var rows = [], row = [], field = '', q = false;
    text = text.replace(/^\uFEFF/, '');
    var sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (x) { return x.trim(); }); });
    if (!rows.length) return { buchungen: [], fehler: 'Die Datei ist leer.' };
    var h = rows[0].map(function (x) { return x.trim().toLowerCase(); });
    function col() { for (var a = 0; a < arguments.length; a++) { var k = h.indexOf(arguments[a]); if (k >= 0) return k; } return -1; }
    var cDate = col('booking date', 'date', 'datum', 'buchungsdatum'),
        cName = col('partner name', 'payee', 'empfänger', 'zahlungsempfänger'),
        cType = col('type', 'transaction type', 'transaktionstyp'),
        cRef = col('payment reference', 'verwendungszweck'),
        cAmt = col('amount (eur)', 'betrag (eur)', 'betrag'),
        cOrig = col('original amount', 'amount (foreign currency)', 'betrag (fremdwährung)'),
        cCur = col('original currency', 'type foreign currency', 'fremdwährung'),
        cRate = col('exchange rate', 'wechselkurs');
    if (cDate < 0 || cAmt < 0) return { buchungen: [], fehler: 'Die Spalten Datum und Betrag fehlen. Bitte den CSV-Export von N26 verwenden.' };
    var out = rows.slice(1).map(function (r) {
      var d = (r[cDate] || '').trim(), datum = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : (/^\d{2}\.\d{2}\.\d{4}$/.test(d) ? iso(d) : '');
      var a = (r[cAmt] || '').trim(), betrag = /,\d{1,2}$/.test(a) ? num(a) : Number(a);
      var info = [cType >= 0 ? r[cType] : '', cRef >= 0 ? r[cRef] : ''].map(function (x) { return (x || '').trim(); }).filter(Boolean);
      if (cOrig >= 0 && r[cOrig] && cCur >= 0 && r[cCur] && r[cCur] !== 'EUR') info.push('Ursprungsbetrag ' + r[cOrig] + ' ' + r[cCur] + (cRate >= 0 && r[cRate] ? ' | Wechselkurs ' + r[cRate] : ''));
      return { name: (cName >= 0 ? r[cName] : '').trim(), datum: datum, betrag: Math.round(betrag * 100) / 100, info: info.join(' · ') };
    }).filter(function (t) { return t.datum && isFinite(t.betrag) && t.betrag !== 0; });
    return { buchungen: out };
  }

  var api = { linesFromItems: linesFromItems, parseStatement: parseStatement, parseCsv: parseCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.N26 = api;
})(typeof window !== 'undefined' ? window : this);
