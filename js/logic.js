/* S1 Tax · Rechenlogik ohne Bildschirm
   UVA, Termine, Rücklage, Jahresvorschau, Bankabgleich, Abos, Excel für CNC.
   Alle Funktionen bekommen den Datenstand D und rechnen nur; gespeichert wird in app.js. */
(function (root) {
  'use strict';
  var L = {};

  /* ---------- Zahlen, Datum, Text ---------- */
  L.r2 = function (x) { return Math.round((Number(x) || 0) * 100 + (x >= 0 ? 1e-9 : -1e-9)) / 100; };
  L.n = function (x) { var v = Number(x); return isFinite(v) ? v : 0; };
  L.fmt = function (x, opt) {
    var v = L.r2(x), neg = v < 0, s = Math.abs(v).toFixed(2).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '−' : (opt && opt.plus && v > 0 ? '+' : '')) + s[0] + ',' + s[1];
  };
  L.eur = function (x, opt) { return L.fmt(x, opt) + ' €'; };
  L.eurRund = function (x) { var v = Math.round(L.n(x)); return (v < 0 ? '−' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; };
  L.parse = function (s) {
    if (typeof s === 'number') return s;
    s = String(s || '').trim().replace(/[€\s]/g, '').replace('−', '-');
    if (!s) return NaN;
    if (/,\d{1,2}$/.test(s) || (s.indexOf(',') >= 0 && s.indexOf('.') >= 0)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return Number(s);
  };
  L.p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  L.MONATE = ['', 'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  L.MON = ['', 'Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  L.datum = function (iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; };
  L.datumKurz = function (iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.'; };
  L.isoAus = function (s) {
    s = String(s || '').trim();
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (m) { var y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return y + '-' + L.p2(+m[2]) + '-' + L.p2(+m[1]); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return '';
  };
  L.iso = function (d) { return d.getFullYear() + '-' + L.p2(d.getMonth() + 1) + '-' + L.p2(d.getDate()); };
  L.heute = function () { return L.iso(new Date()); };
  L.plusTage = function (iso, n) { var p = iso.split('-'); return L.iso(new Date(+p[0], +p[1] - 1, +p[2] + n)); };
  L.tageBis = function (iso, von) {
    var a = (von || L.heute()).split('-'), b = iso.split('-');
    return Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
  };
  L.monatsEnde = function (j, m) { return j + '-' + L.p2(m) + '-' + L.p2(new Date(j, m, 0).getDate()); };
  L.monatPlus = function (j, m, n) { var t = j * 12 + (m - 1) + n; return { jahr: Math.floor(t / 12), monat: (t % 12) + 1 }; };
  L.uvaFaellig = function (j, m) { var x = L.monatPlus(j, m, 2); return x.jahr + '-' + L.p2(x.monat) + '-15'; };
  L.imMonat = function (iso, j, m) { return !!iso && iso.slice(0, 7) === j + '-' + L.p2(m); };
  L.esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  L.STOP = ['gmbh', 'und', 'der', 'die', 'das', 'austria', 'tankstelle', 'service', 'sagt', 'danke', 'www', 'com', 'ag', 'eu', 'the', 'trip', 'business', 'mastercard'];
  L.tokens = function (s) {
    return (String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[a-z0-9]+/g) || [])
      .filter(function (w) { return w.length >= 3 && L.STOP.indexOf(w) < 0 && !/^\d+$/.test(w); });
  };
  L.aehnlich = function (a, b) { var x = L.tokens(a), y = L.tokens(b); return x.some(function (w) { return y.some(function (v) { return v === w || (w.length >= 4 && v.length >= 4 && (v.indexOf(w) === 0 || w.indexOf(v) === 0)); }); }); };
  L.anbieter = function (name) {
    var t = L.tokens(String(name || '').replace(/\*.*$/, ' ').replace(/\b(amzn|amazon)\b.*$/i, 'amazon'));
    return t.slice(0, 2).join(' ') || String(name || '').toLowerCase().trim();
  };

  /* ---------- Konten ---------- */
  L.kfz = function (k) { k = Number(k); return k === 630 || (k >= 7250 && k <= 7259); };
  L.ausgabeKonto = function (k) { k = Number(k); return k >= 4000 && k < 9000 || (k > 0 && k < 1000); };
  L.STEUERART = { vst: 'Vorsteuer', rc: 'Reverse Charge', ig: 'ig Erwerb', ausland: 'Ausländische Steuer', keine: 'ohne Vorsteuer' };

  /* ---------- Belege ---------- */
  L.aktiv = function (b) { return !b.storniert; };
  /* zählt in UVA, Excel und Summen: nicht storniert, nicht privat, kein ungeklärtes Doppel */
  L.doppelVerdacht = function (b) { return b.bestaetigt === false && !!(b.lesung && b.lesung.ki && b.lesung.ki.doppelt_gruppe); };
  L.zaehlt = function (b) { return !b.storniert && b.status !== 'privat' && !L.doppelVerdacht(b); };
  L.belegNr = function (b) { return b && b.nr ? b.nr + '/' + String(b.jahr).slice(2) : ''; };
  L.gruppen = function (belege, filter) {
    var map = {}, out = [];
    belege.forEach(function (b) {
      if (filter && !filter(b)) return;
      var g = map[b.gruppe];
      if (!g) { g = map[b.gruppe] = { gruppe: b.gruppe, rows: [], brutto: 0, netto: 0, ust: 0 }; out.push(g); }
      g.rows.push(b);
    });
    out.forEach(function (g) {
      var f = g.rows[0];
      ['jahr', 'monat', 'nr', 'datum', 'lieferant', 'text', 'zahlung', 'status', 'datei', 'storniert', 'bestaetigt', 'konto', 'steuerart', 'quelle', 'anlage', 'garantie_bis', 'notiz', 'rechnungsnr', 'waehrung'].forEach(function (k) { g[k] = f[k]; });
      g.rows.forEach(function (b) {
        if (b.storniert) return;
        g.brutto += L.n(b.brutto); g.netto += L.n(b.netto); g.ust += L.n(b.ust);
        if (!g.datum && b.datum) g.datum = b.datum;
        if (b.status === 'unklar') g.status = 'unklar';
        if (!b.bestaetigt) g.bestaetigt = false;
        if (b.datei && !g.datei) g.datei = b.datei;
      });
      g.brutto = L.r2(g.brutto); g.netto = L.r2(g.netto); g.ust = L.r2(g.ust);
      g.storniert = g.rows.every(function (b) { return b.storniert; });
      /* einzelne Zeilen können privat sein (z. B. Getränk auf der Tankrechnung): ganz privat nur, wenn alle Zeilen privat sind */
      var aktiv = g.rows.filter(function (b) { return !b.storniert; }), priv = aktiv.filter(function (b) { return b.status === 'privat'; });
      g.privat = L.r2(priv.reduce(function (n, b) { return n + L.n(b.brutto); }, 0));
      g.privatNetto = L.r2(priv.reduce(function (n, b) { return n + L.n(b.netto); }, 0));
      g.privatUst = L.r2(priv.reduce(function (n, b) { return n + L.n(b.ust); }, 0));
      if (aktiv.length) {
        var gesch = aktiv.filter(function (b) { return b.status !== 'privat'; });
        g.status = !gesch.length ? 'privat' : gesch.some(function (b) { return b.status === 'unklar'; }) ? 'unklar' : gesch[0].status;
      }
    });
    return out;
  };
  L.sortBelege = function (a, b) {
    if (a.nr && b.nr) return a.nr - b.nr;
    if (a.nr) return -1; if (b.nr) return 1;
    if (a.zahlung !== b.zahlung) return a.zahlung === 'bank' ? -1 : 1;
    return String(a.datum || '9').localeCompare(String(b.datum || '9'));
  };
  L.dateiname = function (g) {
    var nr = g.nr ? g.nr + '-' + String(g.jahr).slice(2) : 'neu-' + String(g.gruppe).slice(0, 6);
    var name = String(g.lieferant || 'Beleg').normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'Beleg';
    var ext = (String(g.datei || '').match(/\.([a-z0-9]+)$/i) || [, 'pdf'])[1].toLowerCase();
    return nr + '_' + name + '_' + L.fmt(g.brutto).replace(/\./g, '').replace('−', '-') + '.' + ext;
  };

  /* ---------- Ausgangsrechnungen ---------- */
  L.ausgestellt = function (a) { return !a.entwurf && !a.storniert; };
  L.bezahlt = function (a) { return !!a.bezahlt_am || (a.bezahlt_betrag !== null && a.bezahlt_betrag !== undefined); };
  L.offen = function (a) { return L.ausgestellt(a) && !L.bezahlt(a); };
  L.faelligAm = function (a) { return L.plusTage(a.datum, Number(a.ziel) || 14); };
  L.kundeName = function (D, a) { var k = (D.kunden || []).find(function (x) { return x.id === a.kunde_id; }); return k ? k.kurz : a.kunde; };
  L.rgAnteil = function (a) {
    var br = L.n(a.brutto), bz = a.bezahlt_betrag === null || a.bezahlt_betrag === undefined ? br : L.n(a.bezahlt_betrag);
    return br > 0 && Math.abs(bz - br) > 0.01 ? bz / br : 1;
  };

  /* ---------- Umsatzsteuer (Istbesteuerung) ---------- */
  L.istAb = function (D) { return (D.einst.steuer && D.einst.steuer.ist_ab) || '2026-01-01'; };
  L.uva = function (D, j, m) {
    var istAb = L.istAb(D), r = { jahr: j, monat: m, umsaetze: [], vst: [], rc: [], ig: [], unklar: [], ohne: [] };
    var k000 = 0, ust = 0;
    D.ausgang.forEach(function (a) {
      if (!L.ausgestellt(a) || !L.imMonat(a.bezahlt_am, j, m) || a.datum < istAb) return;
      var f = L.rgAnteil(a); k000 += L.n(a.netto) * f; ust += L.n(a.ust) * f; r.umsaetze.push(a);
    });
    var k060 = 0, k057 = 0, k066 = 0, k070 = 0, k072 = 0, k065 = 0;
    D.belege.forEach(function (b) {
      if (b.jahr !== j || b.monat !== m || !L.zaehlt(b)) return;
      if (b.status === 'unklar') r.unklar.push(b);
      var satz = b.steuersatz === null || b.steuersatz === undefined || b.steuerart !== 'vst' ? 20 : L.n(b.steuersatz);
      if (b.steuerart === 'vst') { k060 += L.n(b.ust); r.vst.push(b); }
      else if (b.steuerart === 'rc') { var s = L.r2(L.n(b.netto) * (b.steuersatz ? L.n(b.steuersatz) : 20) / 100); k057 += s; if (!L.kfz(b.konto)) k066 += s; r.rc.push(b); }
      else if (b.steuerart === 'ig') { var t = L.r2(L.n(b.netto) * (b.steuersatz ? L.n(b.steuersatz) : 20) / 100); k070 += L.n(b.netto); k072 += t; if (!L.kfz(b.konto)) k065 += t; r.ig.push(b); }
      else r.ohne.push(b);
      void satz;
    });
    r.kz = { '000': L.r2(k000), '022': L.r2(k000), '057': L.r2(k057), '070': L.r2(k070), '072': L.r2(k072), '060': L.r2(k060), '065': L.r2(k065), '066': L.r2(k066) };
    r.ust = L.r2(ust);
    r.zahllast = L.r2(ust + k057 + k072 - k060 - k066 - k065);
    r.faellig = L.uvaFaellig(j, m);
    var mo = L.monat(D, j, m);
    r.gemeldet = mo && mo.uva_gemeldet_am;
    r.bezahlt = mo && (mo.uva_bezahlt_am || (mo.uva_bezahlt !== null && mo.uva_bezahlt !== undefined));
    r.gemeldetBetrag = mo && mo.uva_zahllast !== null && mo.uva_zahllast !== undefined ? L.n(mo.uva_zahllast) : null;
    r.bezahltBetrag = mo && mo.uva_bezahlt !== null && mo.uva_bezahlt !== undefined ? L.n(mo.uva_bezahlt) : null;
    r.zahlung = L.uvaZahlung(D, j, m);
    if (!r.bezahlt && r.zahlung) { r.bezahlt = true; r.bezahltBetrag = -L.n(r.zahlung.betrag); }
    r.erledigt = r.zahllast <= 0 ? !!r.gemeldet || r.bezahlt : r.bezahlt;
    return r;
  };
  /* Zahlung ans Finanzamt mit "U MM/JJ" im Verwendungszweck */
  L.uvaZahlung = function (D, j, m) {
    return D.bank.find(function (b) {
      if (b.betrag >= 0 || !/finanzamt/i.test(b.name)) return false;
      var x = String(b.info).match(/\bU\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
      if (!x) return false;
      var y = Number(x[2]); if (y < 100) y += 2000;
      return Number(x[1]) === m && y === j;
    }) || null;
  };
  L.monat = function (D, j, m) { return D.monate.find(function (x) { return x.jahr === j && x.monat === m; }) || null; };

  /* ---------- Termine, Kontostand, Rücklage ---------- */
  L.kontostand = function (D) {
    var st = D.einst.start || {}, ab = st.kontostand_datum || '1900-01-01', v = L.n(st.kontostand), letzt = ab;
    D.bank.forEach(function (b) { if (b.datum > ab) { v += L.n(b.betrag); if (b.datum > letzt) letzt = b.datum; } });
    return { betrag: L.r2(v), stand: letzt };
  };
  L.ESTQ = [[2, 15], [5, 15], [8, 15], [11, 15]];
  L.SVSQ = [[2, 28], [5, 31], [8, 31], [11, 30]];
  L.bankNahe = function (D, iso, re, vor, nach) {
    return D.bank.find(function (b) { var t = L.tageBis(b.datum, iso); return b.betrag < 0 && re.test(b.name + ' ' + b.info) && t <= vor && -t <= nach; }) || null;
  };
  L.termine = function (D, jahr) {
    var st = D.einst.steuer || {}, out = [];
    var istAb = L.istAb(D);
    for (var i = -2; i < 10; i++) {
      var x = L.monatPlus(jahr, 1, i);
      if (L.monatsEnde(x.jahr, x.monat) < istAb) continue;
      var u = L.uva(D, x.jahr, x.monat);
      if (x.jahr * 12 + x.monat > Number(L.heute().slice(0, 4)) * 12 + Number(L.heute().slice(5, 7)) && !u.gemeldet) {
        out.push({ datum: u.faellig, art: 'uva', titel: 'UVA ' + L.MONATE[x.monat] + ' ' + x.jahr, betrag: null, erledigt: false, offenNoch: true, jahr: x.jahr, monat: x.monat });
        continue;
      }
      out.push({ datum: u.faellig, art: 'uva', titel: 'UVA ' + L.MONATE[x.monat] + ' ' + x.jahr, betrag: u.gemeldetBetrag !== null ? u.gemeldetBetrag : u.zahllast, erledigt: u.erledigt, jahr: x.jahr, monat: x.monat, zahlung: u.zahlung });
    }
    var vzq = L.n(st.est_vz_quartal), man = D.einst.termine_erledigt || {};
    L.ESTQ.forEach(function (q) {
      var iso = jahr + '-' + L.p2(q[0]) + '-' + L.p2(q[1]);
      var z = L.bankNahe(D, iso, /finanzamt.*\bE\b/i, 25, 30), m = man['est|' + iso];
      out.push({ datum: iso, art: 'est', key: 'est|' + iso, titel: 'Einkommensteuer-Vorauszahlung', betrag: vzq, erledigt: !!z || !!m, zahlung: z, manuell: m || null });
    });
    var sq = L.n(st.svs_quartal);
    L.SVSQ.forEach(function (q) {
      var iso = jahr + '-' + L.p2(q[0]) + '-' + L.p2(q[1]);
      var z = L.bankNahe(D, iso, /sozialversicherung|\bsvs\b/i, 25, 30), m = man['svs|' + iso];
      out.push({ datum: iso, art: 'svs', key: 'svs|' + iso, titel: 'SVS-Beiträge', betrag: sq, erledigt: !!z || !!m, zahlung: z, manuell: m || null });
    });
    out.sort(function (a, b) { return a.datum.localeCompare(b.datum); });
    return out.filter(function (t) { return t.datum.slice(0, 4) === String(jahr); });
  };
  L.ruecklage = function (D) {
    var heute = L.heute(), j = +heute.slice(0, 4), m = +heute.slice(5, 7), posten = [];
    /* abgelaufene Monate ohne Zahlung und der laufende Monat bis heute */
    for (var i = -3; i <= 0; i++) {
      var x = L.monatPlus(j, m, i), u = L.uva(D, x.jahr, x.monat);
      if (u.bezahlt || u.zahllast <= 0) continue;
      if (u.gemeldetBetrag !== null && u.gemeldetBetrag <= 0) continue;
      posten.push({ titel: 'UVA ' + L.MONATE[x.monat] + (i === 0 ? ' (bis heute)' : ''), betrag: u.zahllast, datum: u.faellig, art: 'uva', jahr: x.jahr, monat: x.monat });
    }
    var bis = L.plusTage(heute, 45);
    [j, j + 1].forEach(function (jj) {
      L.termine(D, jj).forEach(function (t) {
        if (t.art === 'uva' || t.erledigt || t.datum < L.plusTage(heute, -20) || t.datum > bis) return;
        posten.push({ titel: t.titel, betrag: t.betrag, datum: t.datum, art: t.art });
      });
    });
    var g = (D.einst.steuer || {}), guthaben = L.n(g.abgabenkonto_guthaben);
    var est = posten.filter(function (p) { return p.art === 'est'; })[0];
    if (est && guthaben > 0) { var abz = Math.min(guthaben, est.betrag); est.hinweis = 'abzüglich Guthaben am Abgabenkonto ' + L.eur(abz); est.betrag = L.r2(est.betrag - abz); }
    var summe = L.r2(posten.reduce(function (n, p) { return n + L.n(p.betrag); }, 0));
    var k = L.kontostand(D);
    return { posten: posten, summe: summe, kontostand: k, frei: L.r2(k.betrag - summe) };
  };

  /* ---------- Jahresvorschau Einkommensteuer ---------- */
  L.TARIF = {
    2026: [[13539, 0], [21992, 0.2], [36458, 0.3], [70365, 0.4], [104859, 0.48], [1000000, 0.5], [Infinity, 0.55]]
  };
  L.tarif = function (jahr) { return L.TARIF[jahr] || L.TARIF[Math.max.apply(null, Object.keys(L.TARIF).map(Number))]; };
  L.est = function (einkommen, jahr) {
    var t = L.tarif(jahr), unten = 0, st = 0;
    for (var i = 0; i < t.length; i++) { var oben = t[i][0]; if (einkommen > unten) st += (Math.min(einkommen, oben) - unten) * t[i][1]; unten = oben; }
    return L.r2(Math.max(0, st));
  };
  /* PKW-Kosten für den Privatanteil, wie CNC ihn rechnet (2024: 20 % von PKW-Aufwand und Leasing):
     Betriebskosten, Parken, Fahrzeugmiete 7250–7259, PKW-Leasing 7260, Kfz-Steuer 7290, Treibstoff 5703 und die PKW-Versicherung */
  L.pkwKosten = function (b) {
    var k = Number(b.konto);
    return (k >= 7250 && k <= 7260) || k === 7290 || k === 5703 || (k === 7700 && /\b(pkw|kfz|auto)/i.test(String(b.text || '') + ' ' + String(b.lieferant || '')));
  };
  /* Abschreibung des gekauften Autos: höchstens 40.000 € (Angemessenheitsgrenze), mindestens 8 Jahre,
     im Kaufjahr halbe Jahres-AfA, wenn ab Juli gekauft */
  L.pkwAfa = function (st, jahr) {
    var preis = L.n(st && st.pkw_kaufpreis), datum = st && st.pkw_kaufdatum;
    if (!(preis > 0) || !/^\d{4}-\d{2}/.test(datum || '')) return 0;
    var basis = Math.min(preis, 40000), nd = Math.max(1, L.n(st.pkw_nd) || 8), jahresAfa = basis / nd;
    var kj = Number(datum.slice(0, 4)), km = Number(datum.slice(5, 7)), summe = 0;
    for (var y = kj; y <= jahr; y++) {
      var a = Math.min(jahresAfa * (y === kj && km > 6 ? 0.5 : 1), basis - summe);
      if (a <= 0) return 0;
      if (y === jahr) return L.r2(a);
      summe += a;
    }
    return 0;
  };
  L.vorschau = function (D, jahr) {
    var erl = 0, aus = 0, svs = 0, anl = 0, letzt = 0, pkw = 0;
    /* Hochrechnung bis zum letzten Monat mit Kontoauszug: Erlöse und die meisten Ausgaben kommen erst mit dem Auszug.
       Fotos aus dem laufenden Monat würden sonst die Hochrechnung verkürzen. */
    D.bank.forEach(function (b) { if (b.jahr === jahr) letzt = Math.max(letzt, b.monat); });
    if (!letzt) D.belege.forEach(function (b) { if (b.jahr === jahr) letzt = Math.max(letzt, b.monat); });
    if (jahr < Number(L.heute().slice(0, 4))) letzt = 12;
    letzt = Math.max(1, Math.min(12, letzt));
    D.ausgang.forEach(function (a) { if (L.ausgestellt(a) && a.bezahlt_am && a.bezahlt_am.slice(0, 4) === String(jahr) && Number(a.bezahlt_am.slice(5, 7)) <= letzt) erl += L.n(a.netto) * L.rgAnteil(a); });
    D.belege.forEach(function (b) {
      if (b.jahr !== jahr || b.monat > letzt || !L.zaehlt(b)) return;
      var k = Number(b.konto), netto = L.n(b.netto);
      if (k === 3600) svs += netto;
      else if (k > 0 && k < 1000) { if (netto <= 1000) aus += netto; else anl += netto / 5 * (b.monat > 6 ? 0.5 : 1); }
      else if (k >= 4000 && k < 9000) aus += netto;
      if (L.pkwKosten(b)) pkw += netto;
    });
    var f = 12 / letzt, st = D.einst.steuer || {}, pp = Math.max(0, Math.min(100, L.n(st.pkw_privat)));
    var autoAfa = L.pkwAfa(st, jahr);
    function rechne(e, a, s, an, kfz, afaAuto) {
      var pkwPrivat = L.r2((kfz + afaAuto) * pp / 100);
      var gewinn = L.r2(e - a - s - an - afaAuto + pkwPrivat), gfb = gewinn > 0 ? L.r2(Math.min(gewinn, 33000) * 0.15) : 0;
      var weitere = L.n(st.weitere_einkuenfte), eink = Math.max(0, L.r2(gewinn - gfb + weitere));
      var est = L.est(eink, jahr), vz = L.n(st.est_vz_jahr);
      return { erloese: L.r2(e), ausgaben: L.r2(a), svs: L.r2(s), afa: L.r2(an), afaAuto: L.r2(afaAuto), pkw: L.r2(kfz + afaAuto), pkwProzent: pp, pkwPrivat: pkwPrivat, gewinn: gewinn, gfb: gfb, weitere: weitere, einkommen: eink, est: est, vz: vz, differenz: L.r2(est - vz) };
    }
    return { monate: letzt, bisher: rechne(erl, aus, svs, anl, pkw, autoAfa * letzt / 12), jahr: rechne(erl * f, aus * f, svs * f, anl, pkw * f, autoAfa) };
  };

  /* ---------- Unterlagen für die Steuererklärung (privat, nicht in der Buchhaltung) ---------- */
  L.zahlAT = function (x) { return Number(String(x).replace(/\./g, '').replace(',', '.')); };
  /* KESt-Kursgewinn-/-verlustaufstellung einer österreichischen Bank: Saldo, abgeführte KESt, Zeitraum */
  L.kestAufstellung = function (text) {
    var t = String(text || '').replace(/\s+/g, ' ');
    var sal = t.match(/Saldo Ertr(?:ä|ae)ge\s*\/\s*Verluste\s*(-?[\d.]+,\d{2})/i), kest = t.match(/abgef(?:ü|ue)hrte KESt\s*(-?[\d.]+,\d{2})/i);
    if (!sal || !kest) return null;
    var iso = function (d) { return d ? d.slice(6, 10) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2) : null; };
    var zr = t.match(/(\d{2}\.\d{2}\.\d{4})\s*bis\s*(\d{2}\.\d{2}\.\d{4})/), depot = t.match(/WERTPAPIERDEPOT\s*([\d-]{6,})/i);
    var sa = L.zahlAT(sal[1]), k = Math.abs(L.zahlAT(kest[1])), ohne = /kein automatischer KESt-Verlustausgleich/i.test(t);
    return { saldo: sa, kest: k, von: zr ? iso(zr[1]) : null, bis: zr ? iso(zr[2]) : null, depot: depot ? depot[1] : null,
      ohneAusgleich: ohne, zuViel: ohne ? L.r2(Math.max(0, k - 0.275 * Math.max(0, sa))) : 0 };
  };

  /* ---------- Bankabgleich ---------- */
  L.verknuepft = function (D) {
    var g = {}, a = {};
    D.bank.forEach(function (b) { if (b.beleg_gruppe) g[b.beleg_gruppe] = b; if (b.ausgang_id) a[b.ausgang_id] = b; });
    return { gruppe: g, ausgang: a };
  };
  L.kandidaten = function (D, bk, alle) {
    var v = L.verknuepft(D), amt = Math.abs(L.n(bk.betrag)), out = [];
    if (bk.betrag < 0) {
      /* auch Barbelege ohne Nummer: ein Foto ist zuerst „bar“, war aber oft eine Kartenzahlung */
      L.gruppen(D.belege, function (b) { return !b.storniert && (b.zahlung === 'bank' || (b.zahlung === 'bar' && !b.nr)); }).forEach(function (g) {
        if (g.status === 'privat') return;
        if (v.gruppe[g.gruppe] && v.gruppe[g.gruppe].id !== bk.id) return;
        var dm = (g.jahr * 12 + g.monat) - (bk.jahr * 12 + bk.monat);
        var tage = g.datum ? Math.abs(L.tageBis(g.datum, bk.datum)) : 0;
        var gleich = Math.abs(g.brutto - amt) < 0.005, name = L.aehnlich(bk.name + ' ' + bk.info, g.lieferant + ' ' + g.text);
        var score = (gleich ? 100 : Math.abs(g.brutto - amt) < Math.max(1, amt * 0.05) ? 30 : 0) + (name ? 40 : 0) - Math.abs(dm) * 10 - Math.min(tage, 30);
        var bar = g.zahlung === 'bar';
        if (!alle && (!gleich || Math.abs(dm) > 1 || tage > 12)) return;
        if (!alle && bar && (!name || tage > 5)) return;
        if (alle && score < 0 && !name && !gleich) return;
        out.push({ art: 'beleg', g: g, gleich: gleich, name: name, bar: bar, score: score - (bar ? 15 : 0) });
      });
    } else {
      D.ausgang.forEach(function (a) {
        if (!L.ausgestellt(a) || (v.ausgang[a.id] && v.ausgang[a.id].id !== bk.id)) return;
        if (a.bezahlt_am && !v.ausgang[a.id] && Math.abs(L.tageBis(a.bezahlt_am, bk.datum)) > 20) return;
        var gleich = Math.abs(L.n(a.brutto) - amt) < 0.005;
        var nr = a.nr && new RegExp('(^|[^0-9])0?' + a.laufnr + '\\s*/\\s*' + a.jahr).test(bk.info + ' ' + bk.name);
        var name = L.aehnlich(bk.name, a.kunde);
        if (!alle && !gleich && !nr) return;
        out.push({ art: 'ausgang', a: a, gleich: gleich, nr: nr, name: name, score: (gleich ? 100 : 0) + (nr ? 80 : 0) + (name ? 30 : 0) });
      });
    }
    out.sort(function (x, y) { return y.score - x.score; });
    return out;
  };
  /* gleiche Buchung früher: wie damals buchen (Konto, Text, Steuer), Monat im Text mitziehen */
  L.wieLetztesMal = function (D, bk) {
    var key = L.anbieter(bk.name), best = null;
    D.bank.forEach(function (b) {
      if (b.id === bk.id || !b.beleg_gruppe || L.anbieter(b.name) !== key || (b.betrag < 0) !== (bk.betrag < 0)) return;
      if (!best || b.datum > best.datum) best = b;
    });
    if (!best) return null;
    var rows = D.belege.filter(function (x) { return x.gruppe === best.beleg_gruppe && !x.storniert; });
    if (rows.length !== 1) return null;
    var r = rows[0], diff = (bk.jahr * 12 + bk.monat) - (best.jahr * 12 + best.monat), amt = Math.abs(L.n(bk.betrag));
    var text = String(r.text || '').replace(/\b(\d{1,2})\/(\d{4})\b/g, function (all, mm, yy) { var x = L.monatPlus(+yy, +mm, diff); return x.monat + '/' + x.jahr; });
    var ust = r.steuerart === 'vst' && L.n(r.brutto) ? L.r2(amt - amt / (1 + (L.n(r.steuersatz) || 20) / 100)) : 0;
    return { lieferant: r.lieferant, text: text, konto: r.konto, steuerart: r.steuerart, steuersatz: r.steuerart === 'vst' ? (L.n(r.steuersatz) || 20) : null, brutto: amt, ust: ust, netto: L.r2(amt - ust), vorbild: r };
  };
  /* Regeln für Steuerzahlungen: kein eigener Beleg, der Kontoauszug ist der Beleg */
  L.steuerBuchung = function (bk) {
    var amt = Math.abs(L.n(bk.betrag)), s = bk.name + ' ' + bk.info, m;
    if (bk.betrag < 0 && /finanzamt/i.test(bk.name)) {
      if ((m = s.match(/\bU\s*(\d{1,2})\s*\/\s*(\d{2,4})/))) { var y = +m[2] < 100 ? 2000 + +m[2] : +m[2]; return { lieferant: 'Finanzamt', text: 'Umsatzsteuer ' + Number(m[1]) + '/' + y, konto: 3470, steuerart: 'keine', brutto: amt, netto: amt, ust: 0 }; }
      if (/\bE\b/.test(s)) { m = s.match(/\bE\s*([\d\-\/]+)/); return { lieferant: 'Finanzamt', text: 'Einkommensteuer-Vorauszahlung' + (m ? ' ' + m[1] : ''), konto: 9410, steuerart: 'keine', brutto: amt, netto: amt, ust: 0 }; }
    }
    if (bk.betrag < 0 && /sozialversicherung/i.test(bk.name)) return { lieferant: 'SVS', text: 'SVS Beiträge ' + bk.monat + '/' + bk.jahr, konto: 3600, steuerart: 'keine', brutto: amt, netto: amt, ust: 0 };
    return null;
  };
  L.regelArt = function (bk) {
    if (/^n26$/i.test(String(bk.name).trim()) && /cashback|prämie/i.test(bk.info)) return 'cashback';
    if (bk.betrag < 0 && /schandl/i.test(bk.name) && /entnahme/i.test(bk.info)) return 'entnahme';
    if (bk.betrag > 0 && /schandl/i.test(bk.name) && /einlage/i.test(bk.info)) return 'einlage';
    return null;
  };
  /* Vorschläge für alle offenen Buchungen; nur eindeutige werden automatisch übernommen */
  L.autoAbgleich = function (D, jahr, monat) {
    var out = [], belegt = {}, rg = {};
    D.bank.forEach(function (bk) {
      if (bk.art !== 'offen' || (jahr && bk.jahr !== jahr) || (monat && bk.monat !== monat)) return;
      var r = L.regelArt(bk);
      if (r) { out.push({ bank: bk, patch: { art: r, notiz: r === 'entnahme' ? 'Entnahme Jürgen Schandl' : r === 'einlage' ? 'Einlage Jürgen Schandl' : null } }); return; }
      var c = L.kandidaten(D, bk, false).filter(function (k) { return k.art === 'beleg' ? !belegt[k.g.gruppe] : !rg[k.a.id]; });
      if (bk.betrag > 0) {
        var gut = c.filter(function (k) { return k.gleich && (k.nr || k.name); });
        if (gut.length !== 1 && c.length === 1 && (c[0].gleich || c[0].nr)) gut = c;
        if (gut.length >= 1 && (gut.length === 1 || gut[0].score > gut[1].score)) {
          var a = gut[0].a; rg[a.id] = 1;
          out.push({ bank: bk, patch: { art: 'ausgang', ausgang_id: a.id, notiz: 'Eingang Rg ' + a.nr + ' ' + a.kunde }, ausgang: { id: a.id, bezahlt_am: bk.datum, bezahlt_betrag: L.n(bk.betrag) } });
        }
        return;
      }
      var top = c.filter(function (k) { return k.gleich; });
      if (top.length > 1) { var mitName = top.filter(function (k) { return k.name; }); if (mitName.length) top = mitName; }
      if (top.length === 1 || (top.length > 1 && top[0].score - top[1].score >= 10)) {
        var g = top[0].g; belegt[g.gruppe] = 1;
        out.push({ bank: bk, patch: { art: 'beleg', beleg_gruppe: g.gruppe }, monatNeu: !g.nr && (g.jahr !== bk.jahr || g.monat !== bk.monat) ? { gruppe: g.gruppe, jahr: bk.jahr, monat: bk.monat } : null, karte: g.zahlung === 'bar' ? g.gruppe : null });
        return;
      }
      if (!c.length) { var s = L.steuerBuchung(bk); if (s) out.push({ bank: bk, neuerBeleg: s }); }
    });
    /* zweiter Durchgang: mehrere Abbuchungen zu einem Beleg (z. B. Uber-Fahrten einer Reise) */
    var erledigt = {}; out.forEach(function (x) { erledigt[x.bank.id] = 1; });
    var v = L.verknuepft(D);
    L.gruppen(D.belege, function (b) { return !b.storniert && b.zahlung === 'bank'; }).forEach(function (g) {
      if (g.status === 'privat' || v.gruppe[g.gruppe] || belegt[g.gruppe] || g.brutto <= 0) return;
      var teile = D.bank.filter(function (bk) {
        if (bk.art !== 'offen' || erledigt[bk.id] || bk.betrag >= 0 || (jahr && bk.jahr !== jahr) || (monat && bk.monat !== monat)) return false;
        if (Math.abs((g.jahr * 12 + g.monat) - (bk.jahr * 12 + bk.monat)) > 1) return false;
        if (g.datum && (L.tageBis(bk.datum, g.datum) > 3 || L.tageBis(g.datum, bk.datum) > 14)) return false;
        return L.aehnlich(bk.name, g.lieferant + ' ' + g.text);
      });
      if (teile.length < 2) return;
      var summe = L.r2(teile.reduce(function (n, bk) { return n - L.n(bk.betrag); }, 0));
      if (Math.abs(summe - g.brutto) > 0.005) return;
      belegt[g.gruppe] = 1;
      teile.forEach(function (bk) { erledigt[bk.id] = 1; out.push({ bank: bk, patch: { art: 'beleg', beleg_gruppe: g.gruppe }, monatNeu: !g.nr && (g.jahr !== bk.jahr || g.monat !== bk.monat) ? { gruppe: g.gruppe, jahr: bk.jahr, monat: bk.monat } : null }); });
    });
    return out;
  };

  /* ---------- Abos und Fixkosten ---------- */
  L.abos = function (D) {
    var per = {};
    D.bank.forEach(function (b) {
      if (b.betrag >= 0 || b.art === 'entnahme' || b.art === 'privat' || /finanzamt|sozialversicherung/i.test(b.name)) return;
      var k = L.anbieter(b.name); if (!k) return;
      (per[k] = per[k] || { key: k, name: b.name, rows: [] }).rows.push(b);
    });
    var heute = L.heute(), hj = +heute.slice(0, 4), hm = +heute.slice(5, 7), out = [];
    Object.keys(per).forEach(function (k) {
      var x = per[k], monate = {};
      x.rows.sort(function (a, b) { return a.datum.localeCompare(b.datum); });
      x.rows.forEach(function (b) { var key = b.jahr * 12 + b.monat - 1; (monate[key] = monate[key] || []).push(b); });
      var keys = Object.keys(monate).map(Number).sort(function (a, b) { return a - b; });
      if (keys.length < 3) return;
      var spanne = keys[keys.length - 1] - keys[0] + 1;
      if (keys.length / spanne < 0.6) return;
      var betraege = x.rows.map(function (b) { return -L.n(b.betrag); });
      var ueblich = betraege.slice().sort(function (a, b) { return a - b; })[Math.floor(betraege.length / 2)];
      var regelmaessig = betraege.filter(function (v) { return Math.abs(v - ueblich) <= Math.max(1, ueblich * 0.03); }).length / betraege.length;
      if (regelmaessig < 0.5) return;
      var hinweise = [];
      keys.forEach(function (key) {
        var list = monate[key], j = Math.floor(key / 12), m = key % 12 + 1;
        if (list.length > 1 && list.filter(function (b) { return Math.abs(-L.n(b.betrag) - ueblich) <= Math.max(1, ueblich * 0.03); }).length > 1) hinweise.push({ art: 'doppelt', text: L.MONATE[m] + ': zweimal abgebucht', jahr: j, monat: m });
        list.forEach(function (b) { var v = -L.n(b.betrag); if (Math.abs(v - ueblich) > Math.max(1, ueblich * 0.03)) hinweise.push({ art: 'preis', text: L.MONATE[m] + ': ' + L.eur(v) + ' statt ' + L.eur(ueblich), jahr: j, monat: m, bank: b }); });
      });
      for (var key = keys[0]; key <= keys[keys.length - 1]; key++) if (!monate[key]) hinweise.push({ art: 'fehlt', text: L.MONATE[key % 12 + 1] + ': keine Abbuchung', jahr: Math.floor(key / 12), monat: key % 12 + 1 });
      var letzt = keys[keys.length - 1], jetzt = hj * 12 + hm - 1;
      var beendet = jetzt - letzt >= 2;
      out.push({ key: k, name: x.rows[x.rows.length - 1].name, ueblich: L.r2(ueblich), anzahl: x.rows.length, monate: keys.length, letzte: x.rows[x.rows.length - 1], beendet: beendet, hinweise: hinweise, rows: x.rows });
    });
    out.sort(function (a, b) { return (a.beendet - b.beendet) || (b.ueblich - a.ueblich); });
    return out;
  };

  /* ---------- Excel für CNC ---------- */
  L.monatsExcel = function (D, j, m) {
    var auszug = 'Kontoauszug N26/' + L.p2(m) + '-' + j;
    var gr = L.gruppen(D.belege, function (b) { return b.jahr === j && b.monat === m && L.zaehlt(b); }).sort(L.sortBelege);
    var rows = [['Datum', 'Name', '', 'Bezeichnung', 'Konto', 'Brutto-Betrag', 'Netto-Betrag', 'Steuer', 'Art', 'Nr', 'Hinweis']];
    rows[0] = rows[0].map(function (h, i) { return i === 0 ? { v: h, s: 'datum' } : h; });
    gr.forEach(function (g) {
      /* Zeilen mit gleichem Konto zusammenfassen, Netto wie bisher als Summe */
      var proKonto = [];
      g.rows.filter(L.zaehlt).forEach(function (b) {
        var k = proKonto.find(function (x) { return x.konto === b.konto; });
        if (!k) { k = { konto: b.konto, rows: [] }; proKonto.push(k); }
        k.rows.push(b);
      });
      proKonto.forEach(function (k) {
        var b0 = k.rows[0], ri = rows.length + 1;
        var brutto = L.r2(k.rows.reduce(function (n, b) { return n + L.n(b.brutto); }, 0));
        var netto = k.rows.length > 1 ? { f: '=' + k.rows.map(function (b) { return L.r2(b.netto); }).join('+'), s: 'buch' } : { v: L.r2(b0.netto), s: 'buch' };
        var hinw = [];
        if (b0.steuerart === 'rc') hinw.push('Reverse Charge ' + (b0.steuersatz || 20) + ' %');
        if (b0.steuerart === 'ig') hinw.push('ig Erwerb ' + (b0.steuersatz || 20) + ' %');
        if (b0.steuerart === 'ausland') hinw.push('ausländische Steuer, keine Vorsteuer');
        if (b0.anlage) hinw.push('Anlagegut');
        if (b0.status === 'unklar') hinw.push('unklar');
        if (b0.waehrung && b0.waehrung !== 'EUR') hinw.push('Währung ' + b0.waehrung);
        rows.push([{ v: g.datum || null, t: 'd', s: 'datum' }, g.lieferant, '', b0.text, Number(b0.konto) || null, { v: brutto, s: 'buch' }, netto, { f: '=F' + ri + '-G' + ri, s: 'buch' }, g.zahlung === 'bar' ? 'Barbeleg' : auszug, { v: L.belegNr(g) || 'neu', t: 's', s: 'text' }, hinw.join(', ') || null]);
      });
    });
    var last = rows.length;
    rows.push([null, null, null, null, null, { f: '=SUM(F2:F' + last + ')', s: 'buchFett' }, { f: '=SUM(G2:G' + last + ')', s: 'buchFett' }, { f: '=SUM(H2:H' + last + ')', s: 'buchFett' }]);
    rows.push([]);
    var unten = D.bank.filter(function (b) { return b.jahr === j && b.monat === m && ['ausgang', 'entnahme', 'einlage', 'privat', 'differenz', 'offen', 'cashback'].indexOf(b.art) >= 0; })
      .map(function (b) {
        var t = b.notiz || (b.art === 'cashback' ? 'N26 Cashback' : b.art === 'offen' ? 'offen: ' + b.name : b.name);
        if (b.art === 'differenz' && !b.notiz) t = 'Differenz ' + b.name;
        return { datum: b.datum, betrag: Math.abs(L.n(b.betrag)), t: t };
      });
    /* privater Anteil eines vom Konto bezahlten Belegs: steht wie eine Entnahme bei den Kontobewegungen */
    L.gruppen(D.belege, function (b) { return b.jahr === j && b.monat === m && !b.storniert; }).forEach(function (g) {
      if (!g.privat || g.status === 'privat' || g.zahlung !== 'bank') return;
      var was = g.rows.filter(function (b) { return !b.storniert && b.status === 'privat'; }).map(function (b) { return b.text; }).filter(Boolean).join(', ');
      unten.push({ datum: g.datum || (j + '-' + L.p2(m) + '-01'), betrag: g.privat, t: 'Privatanteil ' + (g.lieferant || '') + (L.belegNr(g) ? ' (Beleg ' + L.belegNr(g) + ')' : '') + (was ? ': ' + was : '') });
    });
    unten.sort(function (a, b) { return String(a.datum).localeCompare(String(b.datum)); }).forEach(function (x) {
      rows.push([{ v: x.datum, t: 'd', s: 'datum' }, { v: x.betrag, s: 'buch' }, x.t, auszug]);
    });
    rows.push([]);
    var ueb = rows.length + 1;
    rows.push([null, null, null, 'Übersicht:', 'Kontonummer', null, 'Netto-Betrag']);
    var konten = [];
    gr.forEach(function (g) { g.rows.filter(L.zaehlt).forEach(function (b) { if (b.konto && konten.indexOf(Number(b.konto)) < 0) konten.push(Number(b.konto)); }); });
    konten.sort(function (a, b) { return a - b; }).forEach(function (k) {
      var r = rows.length + 1;
      rows.push([null, null, null, null, k, { f: '=SUMIF($E$2:$E$' + last + ',E' + r + ',$F$2:$F$' + last + ')', s: 'buch' }, { f: '=SUMIF($E$2:$E$' + last + ',E' + r + ',$G$2:$G$' + last + ')', s: 'buch' }]);
    });
    var end = rows.length;
    rows.push([null, null, null, null, null, { f: '=SUM(F' + (ueb + 1) + ':F' + end + ')', s: 'buchFett' }, { f: '=SUM(G' + (ueb + 1) + ':G' + end + ')', s: 'buchFett' }]);

    var ar = [[{ v: 'Datum', s: 'datum' }, 'Empfänger', 'Nummer', 'Kto', 'Netto', 'UST', 'Brutto', 'Zahlungseingang']];
    D.ausgang.filter(function (a) { return L.ausgestellt(a) && L.imMonat(a.datum, j, m); })
      .sort(function (a, b) { return (a.laufnr || 0) - (b.laufnr || 0); })
      .forEach(function (a) {
        var r = ar.length + 1;
        ar.push([{ v: a.datum, t: 'd', s: 'datum' }, a.kunde, { v: a.nr, t: 's', s: 'text' }, 4100, { v: L.r2(a.netto), s: 'buch' }, { v: L.r2(a.ust), s: 'buch' }, { f: '=E' + r + '+F' + r, s: 'buch' }, a.bezahlt_am ? { v: a.bezahlt_am, t: 'd', s: 'datum' } : null]);
      });
    var al = ar.length;
    ar.push([null, null, null, null, { f: '=SUM(E2:E' + al + ')', s: 'buchFett' }, { f: '=SUM(F2:F' + al + ')', s: 'buchFett' }, { f: '=SUM(G2:G' + al + ')', s: 'buchFett' }]);
    ar.push([]);
    ar.push([null, null, 'Übersicht:', 4100, { f: '=E' + (al + 1), s: 'buch' }]);
    var tag = L.p2(m) + '-' + j;
    return [
      { name: 'Eingangsrechnungen ' + tag, cols: [15.4, 27.3, 4, 39.4, 10, 15, 15, 13, 26, 9, 30], freeze: 'A2', rows: rows },
      { name: 'Ausgangsrechnung ' + tag, cols: [14.1, 31.1, 13.1, 8, 14, 12, 14, 17], rows: ar }
    ];
  };
  L.monatsDatei = function (j, m) { return m + '-' + String(j).slice(2) + '.xlsx'; };

  L.rechnungsnummernExcel = function (D) {
    var jahre = {};
    D.ausgang.forEach(function (a) { if (!a.entwurf) (jahre[a.jahr] = jahre[a.jahr] || []).push(a); });
    return Object.keys(jahre).sort().map(function (j) {
      var list = jahre[j].sort(function (a, b) { return a.laufnr - b.laufnr; });
      var rows = [[], [null, { v: 'S1-Secure Rechnungsnummer', s: 'fett' }, null, null, null, null, { v: Number(j), s: 'fett' }], [],
        [null, { v: 'Re Nr', s: 'fett' }, { v: 'Datum', s: 'fett' }, { v: 'Kunde', s: 'fett' }, { v: 'Netto', s: 'fett' }, { v: 'Mwst ', s: 'fett' }, { v: 'Brutto', s: 'fett' }, { v: 'eingelangt', s: 'fett' }, { v: 'Notiz', s: 'fett' }]];
      list.forEach(function (a) {
        rows.push([null, { v: a.nr, t: 's', s: 'text' }, { v: a.datum, t: 'd', s: 'datum' }, a.kunde, { v: L.r2(a.netto), s: 'euro' }, { v: L.r2(a.ust), s: 'euro' }, { v: L.r2(a.brutto), s: 'euro' },
          a.storniert ? 'storniert' : a.bezahlt_am ? { v: a.bezahlt_am, t: 'd', s: 'datum' } : null, a.notiz || null]);
      });
      var e = rows.length;
      rows.push([null, { v: 'SUMMEN', s: 'fett' }, null, null, { f: '=SUM(E5:E' + e + ')', s: 'euroFett' }, { f: '=SUM(F5:F' + e + ')', s: 'euroFett' }, { f: '=SUM(G5:G' + e + ')', s: 'euroFett' }]);
      return { name: String(j), cols: [3, 10, 11, 28, 13.6, 12, 13, 11, 40], rows: rows };
    });
  };

  L.fragenExcel = function (D, jahr) {
    var rows = [[{ v: 'Monat', s: 'fett' }, { v: 'Nr', s: 'fett' }, { v: 'Datum', s: 'fett' }, { v: 'Lieferant', s: 'fett' }, { v: 'Text', s: 'fett' }, { v: 'Brutto', s: 'fett' }, { v: 'Frage', s: 'fett' }, { v: 'Antwort', s: 'fett' }]];
    L.gruppen(D.belege, function (b) { return b.jahr === jahr && !b.storniert && b.status === 'unklar'; }).sort(function (a, b) { return (a.monat - b.monat) || L.sortBelege(a, b); }).forEach(function (g) {
      var fr = (D.fragen || []).filter(function (f) { return f.tabelle === 'belege' && g.rows.some(function (r) { return r.id === f.datensatz; }); });
      rows.push([L.MONATE[g.monat], { v: L.belegNr(g), t: 's' }, { v: g.datum, t: 'd', s: 'datum' }, g.lieferant, g.text, { v: g.brutto, s: 'buch' }, fr.map(function (f) { return f.text; }).join(' | ') || g.notiz || null, fr.map(function (f) { return f.antwort; }).filter(Boolean).join(' | ') || null]);
    });
    return [{ name: 'Fragen ' + jahr, cols: [11, 8, 11, 28, 36, 12, 50, 50], freeze: 'A2', rows: rows }];
  };

  /* ---------- Hinweise für die Übersicht ---------- */
  L.hinweise = function (D, ich) {
    var out = [], heute = L.heute(), j = +heute.slice(0, 4);
    var neu = L.gruppen(D.belege, function (b) { return !b.storniert && !b.bestaetigt; });
    if (neu.length) out.push({ prio: 1, ziel: 'belege:neu', titel: neu.length + (neu.length === 1 ? ' neuer Beleg' : ' neue Belege') + ' zum Bestätigen', text: 'Die App hat sie gelesen. Bitte kurz prüfen.' });
    var offen = D.bank.filter(function (b) { return b.art === 'offen'; });
    if (offen.length) out.push({ prio: 2, ziel: 'bank:offen', titel: offen.length + ' Bankbuchung' + (offen.length === 1 ? '' : 'en') + ' ohne Beleg', text: L.eur(offen.reduce(function (n, b) { return n + L.n(b.betrag); }, 0)) });
    var fr = (D.fragen || []).filter(function (f) { return !f.erledigt && (!f.antwort ? f.von !== ich : f.von === ich); });
    if (fr.length) out.push({ prio: 1, ziel: 'fragen', titel: fr.length + ' Rückfrage' + (fr.length === 1 ? '' : 'n'), text: fr[0].text.slice(0, 80) });
    var unklar = L.gruppen(D.belege, function (b) { return !b.storniert && b.status === 'unklar'; });
    if (unklar.length) out.push({ prio: 3, ziel: 'belege:unklar', titel: unklar.length + ' unklare Buchung' + (unklar.length === 1 ? '' : 'en'), text: 'Kommen am Jahresende auf die Frageliste für CNC.' });
    for (var i = -3; i <= 0; i++) {
      var x = L.monatPlus(j, +heute.slice(5, 7), i), u = L.uva(D, x.jahr, x.monat), t = L.tageBis(u.faellig);
      if (!u.erledigt && x.jahr * 12 + x.monat < j * 12 + +heute.slice(5, 7) && t <= 12)
        out.push({ prio: t < 0 ? 0 : 1, ziel: 'uva:' + x.jahr + '-' + x.monat, titel: 'UVA ' + L.MONATE[x.monat] + ': ' + L.eur(u.zahllast), text: (t < 0 ? 'seit ' + (-t) + ' Tagen fällig' : t === 0 ? 'heute fällig' : 'fällig am ' + L.datum(u.faellig)) + (u.gemeldet ? ' · gemeldet' : ' · noch melden') });
    }
    D.ausgang.filter(L.offen).forEach(function (a) {
      var t = L.tageBis(L.faelligAm(a));
      if (t < 0) out.push({ prio: 2, ziel: 'ausgang:' + a.id, titel: 'Rechnung ' + a.nr + ' ' + a.kunde + ' überfällig', text: L.eur(a.brutto) + ' · seit ' + (-t) + ' Tagen' + (a.erinnert_am ? ' · erinnert am ' + L.datum(a.erinnert_am) : '') });
    });
    D.ausgang.filter(function (a) { return a.entwurf; }).forEach(function (a) {
      out.push({ prio: 2, ziel: 'ausgang:' + a.id, titel: 'Entwurf ' + a.kunde + ' bereit', text: L.eur(a.brutto) + ' · ' + (a.zeitraum || L.datum(a.datum)) });
    });
    L.termine(D, j).concat(L.termine(D, j + 1)).forEach(function (t) {
      if (t.art === 'uva' || t.erledigt) return;
      var d = L.tageBis(t.datum);
      var gh = t.art === 'est' ? L.n((D.einst.steuer || {}).abgabenkonto_guthaben) : 0, betr = gh > 0 ? Math.max(0, t.betrag - gh) : t.betrag;
      if (d >= -5 && d <= 10) out.push({ prio: d < 0 ? 0 : 2, ziel: 'steuer', titel: t.titel + ': ' + L.eur(betr) + (gh > 0 ? ' (nach Guthaben)' : ''), text: d < 0 ? 'seit ' + (-d) + ' Tagen fällig, keine Zahlung gefunden' : d === 0 ? 'heute fällig' : 'fällig am ' + L.datum(t.datum) });
    });
    D.belege.forEach(function (b) {
      if (!b.garantie_bis || b.storniert) return;
      var d = L.tageBis(b.garantie_bis);
      if (d >= 0 && d <= 30) out.push({ prio: 3, ziel: 'anlagen', titel: 'Garantie endet: ' + b.lieferant, text: (b.text || '') + ' · am ' + L.datum(b.garantie_bis) });
    });
    for (var k = 1; k <= 3; k++) {
      var y = L.monatPlus(j, +heute.slice(5, 7), -k), mo = L.monat(D, y.jahr, y.monat);
      if (y.jahr < 2027 && (!mo || !mo.abgeschlossen_am) && D.belege.some(function (b) { return b.jahr === y.jahr && b.monat === y.monat && !b.nr; }))
        out.push({ prio: 3, ziel: 'monat:' + y.jahr + '-' + y.monat, titel: L.MONATE[y.monat] + ' noch nicht abgeschlossen', text: 'Belegnummern werden beim Abschluss vergeben.' });
      if (y.jahr >= 2027 && (!mo || !mo.abgeschlossen_am)) out.push({ prio: 3, ziel: 'monat:' + y.jahr + '-' + y.monat, titel: L.MONATE[y.monat] + ' abschließen', text: 'Belegnummern vergeben, Excel für CNC erstellen.' });
      if (mo && mo.abgeschlossen_am && (!mo.geprueft_am || mo.nach_pruefung_geaendert)) out.push({ prio: 3, ziel: 'monat:' + y.jahr + '-' + y.monat, titel: L.MONATE[y.monat] + (mo.nach_pruefung_geaendert ? ' nach der Prüfung geändert' : ' noch nicht geprüft'), text: 'Kontrolle durch Dagmar' });
    }
    if (!(D.einst.firma || {}).iban) out.push({ prio: 4, ziel: 'einstellungen', titel: 'IBAN für die Rechnungen fehlt', text: 'Einmal in den Einstellungen eintragen.' });
    out.sort(function (a, b) { return a.prio - b.prio; });
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else root.L = L;
})(typeof window !== 'undefined' ? window : globalThis);
