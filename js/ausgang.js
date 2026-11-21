/* S1 Tax · Ausgangsrechnungen
   Rechnungen aus Jürgens Vorlagen schreiben (Entwurf → Ausstellen mit fortlaufender Nummer),
   als PDF speichern und verschicken, Zahlungseingang und Erinnerung, Rechnungsnummern-Liste, Kunden. */
(function () {
  'use strict';
  var APP = window.APP, L = window.L, D = APP.D, S = APP.S, h = APP.h, R = window.Rechnung;
  var MON3 = ['', 'Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  var KD_FELDER = [['name1', 'Name', 'z. B. Muster GmbH'], ['name2', 'Name, 2. Zeile', 'falls nötig'], ['strasse', 'Straße und Hausnummer', ''], ['ort', 'PLZ und Ort', 'z. B. 1010 Wien'], ['mail', 'Rechnung per E-Mail an', 'rechnung@firma.at'], ['bestellnr', 'Bestellnummer des Kunden', 'falls vorhanden'], ['ansprech', 'Ansprechpartner', 'falls vorhanden'], ['uid', 'UID des Kunden', 'ATU12345678'], ['ziel', 'Zahlungsziel in Tagen', '14']];

  function kunde(id) { return D.kunden.find(function (k) { return k.id === id; }); }
  function vorlagen() { return D.einst.vorlagen || []; }
  function vorlage(id) { return vorlagen().find(function (v) { return v.id === id; }); }
  function vormonat(d) {
    var j = +d.slice(0, 4), m = +d.slice(5, 7), x = L.monatPlus(j, m, d.slice(8, 10) <= '10' ? -1 : 0);
    return { von: '01.' + L.p2(x.monat) + '.' + x.jahr, bis: L.datum(L.monatsEnde(x.jahr, x.monat)), zeitraum: '01. ' + MON3[x.monat] + ' – ' + L.monatsEnde(x.jahr, x.monat).slice(8) + '. ' + MON3[x.monat] + '. ' + x.jahr, monat: x };
  }
  function kdAusKunde(k) { k = k || {}; return { name1: k.name1 || '', name2: k.name2 || '', strasse: k.strasse || '', ort: k.ort || '', mail: k.mail || '', bestellnr: k.bestellnr || '', ansprech: k.ansprech || '', uid: k.uid || '', ziel: k.ziel || 14 }; }
  function zustand(a) { if (a.storniert) return ['storniert', '']; if (a.entwurf) return ['Entwurf', 'yel']; if (L.bezahlt(a)) return ['bezahlt' + (a.bezahlt_am ? ' ' + L.datumKurz(a.bezahlt_am) : ''), 'ok']; var t = L.tageBis(L.faelligAm(a)), bis = L.bankBis(D); if (t < 0 && bis && L.faelligAm(a) > bis) return ['offen · Kontoauszug erst bis ' + L.datumKurz(bis), 'yel']; return t < 0 ? ['überfällig ' + (-t) + ' T.', 'bad'] : ['offen · fällig ' + L.datumKurz(L.faelligAm(a)), '']; }

  /* ---------- Übersicht ---------- */
  APP.V.ausgang = {
    titel: 'Ausgangsrechnungen',
    render: function (arg) {
      var teil = String(arg || '').split('/');
      if (teil[0] === 'kunden') return kundenSeite();
      if (teil[0] === 'liste') return listeSeite(+(teil[1] || L.heute().slice(0, 4)));
      var j = +L.heute().slice(0, 4);
      var dieses = D.ausgang.filter(function (a) { return a.jahr === j && L.ausgestellt(a); });
      var offen = D.ausgang.filter(L.offen).sort(function (a, b) { return a.datum.localeCompare(b.datum); });
      var entw = D.ausgang.filter(function (a) { return a.entwurf; });
      var offenSum = offen.reduce(function (n, a) { return n + L.n(a.brutto); }, 0);
      var bisB = L.bankBis(D), ueber = offen.filter(function (a) { return L.tageBis(L.faelligAm(a)) < 0 && !(bisB && L.faelligAm(a) > bisB); }).length;
      var naechste = Math.max.apply(null, [0].concat(D.ausgang.filter(function (a) { return a.jahr === j && a.laufnr; }).map(function (a) { return a.laufnr; }))) + 1;
      var vl = vorlagen().map(function (v) {
        var vm = vormonat(L.heute()), sub = v.id === 'ifms' ? vm.von + ' – ' + vm.bis : v.id === 'oegk' ? vm.zeitraum : v.id === 'schulung' ? 'je Schulung + Pauschale, km à 0,50 €' : 'andere Kunden und Leistungen';
        return '<button type="button" class="tile" style="background:var(--blueBg);border:1px solid var(--blueLine)" data-go="rechnung/neu/' + v.id + '"><span class="v" style="font-size:17px">' + h(v.label) + '</span><span class="u">' + h(sub) + '</span></button>';
      }).join('');
      var zeile = function (a) {
        var z = zustand(a);
        return '<button type="button" class="item" data-go="rechnung/' + a.id + '"><div class="grow"><span class="t">' + (a.entwurf ? 'Entwurf' : h(a.nr)) + ' · ' + h(a.kunde) + '</span><span class="s">vom ' + L.datum(a.datum) + (a.zeitraum ? ' · ' + h(a.zeitraum) : '') + (a.gesendet_am ? ' · gesendet ' + L.datumKurz(a.gesendet_am) : '') + (a.erinnert_am ? ' · erinnert ' + L.datumKurz(a.erinnert_am) : '') + '</span></div><span class="amt">' + L.eur(a.brutto) + '</span><span class="chip ' + z[1] + '">' + z[0] + '</span></button>';
      };
      return '<div class="top"><div><h1>Ausgangsrechnungen ' + j + '</h1><div class="s">Nächste Nummer: ' + L.p2(naechste) + '/' + j + '</div></div><div class="acts"><button type="button" class="btn" data-go="ausgang/liste/' + j + '">Rechnungsnummern</button><button type="button" class="btn" data-go="ausgang/kunden">Kunden</button></div></div>' +
        '<div class="tiles"><div class="tile"><span class="k">Rechnungen ' + j + '</span><span class="v">' + dieses.length + '</span><span class="u">' + L.eur(dieses.reduce(function (n, a) { return n + L.n(a.netto); }, 0)) + ' netto</span></div>' +
        '<div class="tile"><span class="k">Offen</span><span class="v">' + L.eur(offenSum) + '</span><span class="u">' + offen.length + ' Rechnung(en)' + (ueber ? ' · ' + ueber + ' überfällig' : '') + '</span></div></div>' +
        '<div class="card"><div class="head"><h2>Neue Rechnung</h2></div><div class="tiles">' + vl + '</div></div>' +
        (entw.length ? '<div class="card flat"><div class="head"><h2>Entwürfe</h2><span class="s">noch ohne Nummer</span></div><div class="list">' + entw.map(zeile).join('') + '</div></div>' : '') +
        '<div class="card flat"><div class="head"><h2>Offen</h2></div><div class="list">' + (offen.length ? offen.map(zeile).join('') : '<div class="empty">Alle Rechnungen sind bezahlt.</div>') + '</div></div>';
    }
  };
  function listeSeite(j) {
    var list = D.ausgang.filter(function (a) { return a.jahr === j && !a.entwurf; }).sort(function (a, b) { return a.laufnr - b.laufnr; });
    var jahre = {}; D.ausgang.forEach(function (a) { jahre[a.jahr] = 1; }); jahre[+L.heute().slice(0, 4)] = 1;
    var sn = 0, su = 0, sb = 0;
    var rows = list.map(function (a) {
      if (!a.storniert) { sn += L.n(a.netto); su += L.n(a.ust); sb += L.n(a.brutto); }
      return '<tr class="click' + (a.storniert ? ' storno' : '') + '" data-go="rechnung/' + a.id + '"><td class="num"><b>' + h(a.nr) + '</b></td><td class="num">' + L.datum(a.datum) + '</td><td>' + h(a.kunde) + '</td><td class="r num">' + L.fmt(a.netto) + '</td><td class="r num hm">' + L.fmt(a.ust) + '</td><td class="r num">' + L.fmt(a.brutto) + '</td><td class="num">' + (a.bezahlt_am ? L.datum(a.bezahlt_am) : L.bezahlt(a) ? 'x' : '') + '</td><td class="s hm">' + h(a.notiz || '') + '</td></tr>';
    }).join('');
    return '<div class="top"><div><h1>Rechnungsnummern ' + j + '</h1><div class="s">Wie deine Excel-Liste. „eingelangt“ setzt die App aus dem Kontoauszug.</div></div><div class="acts"><div class="seg">' +
      Object.keys(jahre).sort().map(function (y) { return '<button type="button" data-go="ausgang/liste/' + y + '" aria-pressed="' + (+y === j) + '">' + y + '</button>'; }).join('') + '</div>' +
      '<button type="button" class="btn" data-act="rn-excel">' + APP.icon('excel', 16) + ' Rechnungsnummern.xlsx</button><button type="button" class="btn ghost" data-go="ausgang">Zurück</button></div></div>' +
      '<div class="card flat"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Re Nr</th><th>Datum</th><th>Kunde</th><th class="r">Netto</th><th class="r hm">MwSt</th><th class="r">Brutto</th><th>eingelangt</th><th class="hm">Notiz</th></tr></thead><tbody>' + rows +
      '<tr class="sum"><td>Summen</td><td></td><td></td><td class="r num">' + L.fmt(sn) + '</td><td class="r num hm">' + L.fmt(su) + '</td><td class="r num">' + L.fmt(sb) + '</td><td></td><td class="hm"></td></tr></tbody></table></div></div>';
  }
  APP.A['rn-excel'] = function (el) { APP.lauf(el, function () { return window.XLSXW.build(L.rechnungsnummernExcel(D)).then(function (b) { APP.speichernUnter(b, 'Rechnungsnummern.xlsx'); }); }); };

  /* ---------- Kunden ---------- */
  function kundenSeite() {
    return '<div class="top"><h1>Kunden</h1><div class="acts"><button type="button" class="btn pri" data-act="kunde-bearbeiten">Neuer Kunde</button><button type="button" class="btn ghost" data-go="ausgang">Zurück</button></div></div>' +
      '<div class="card flat"><div class="list">' + D.kunden.slice().sort(function (a, b) { return a.kurz.localeCompare(b.kurz); }).map(function (k) {
        var fehlt = ['name1', 'strasse', 'ort', 'mail', 'uid'].filter(function (f) { return !k[f]; });
        return '<button type="button" class="item" data-act="kunde-bearbeiten" data-id="' + k.id + '"><div class="grow"><span class="t">' + h(k.kurz) + (k.aktiv ? '' : ' <span class="chip">inaktiv</span>') + '</span><span class="s">' + h([k.name1, k.strasse, k.ort].filter(Boolean).join(', ')) + (k.mail ? ' · ' + h(k.mail) : '') + ' · Ziel ' + k.ziel + ' Tage</span></div>' + (fehlt.length ? '<span class="chip warn">fehlt: ' + fehlt.map(function (f) { return { name1: 'Name', strasse: 'Straße', ort: 'Ort', mail: 'E-Mail', uid: 'UID' }[f]; }).join(', ') + '</span>' : '') + '</button>';
      }).join('') + '</div></div>';
  }
  APP.A['kunde-bearbeiten'] = function (el) {
    var k = el.dataset.id ? kunde(el.dataset.id) : { kurz: '', ziel: 14, aktiv: true };
    APP.modal({
      title: k.id ? 'Kunde ' + k.kurz : 'Neuer Kunde',
      body: '<div class="grid g2" id="kf"><label class="f">Kurzname (für Listen)<input class="in" name="kurz" value="' + h(k.kurz) + '" autofocus></label>' +
        KD_FELDER.map(function (f) { return '<label class="f">' + f[1] + '<input class="in" name="' + f[0] + '" placeholder="' + h(f[2]) + '" value="' + h(k[f[0]] === undefined || k[f[0]] === null ? '' : k[f[0]]) + '"></label>'; }).join('') +
        '<label class="f" style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="aktiv"' + (k.aktiv !== false ? ' checked' : '') + '> aktiv</label></div>',
      foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn pri" data-act="kunde-speichern" data-id="' + (k.id || '') + '">Speichern</button>'
    });
  };
  APP.A['kunde-speichern'] = function (el) {
    var v = APP.formDaten(document.getElementById('kf'));
    if (!v.kurz.trim()) { APP.toast('Bitte einen Kurznamen eintragen.', { bad: true }); return; }
    var row = { kurz: v.kurz.trim(), name1: v.name1, name2: v.name2, strasse: v.strasse, ort: v.ort, mail: v.mail.trim(), bestellnr: v.bestellnr, ansprech: v.ansprech, uid: v.uid.replace(/\s/g, '').toUpperCase(), ziel: Number(v.ziel) || 14, aktiv: !!v.aktiv };
    APP.lauf(el, function () { return (el.dataset.id ? APP.upd('kunden', { id: el.dataset.id }, row) : APP.ins('kunden', [row])).then(function () { APP.schliessen(); APP.toast('Kunde gespeichert.'); APP.render(); }); });
  };

  /* ---------- Rechnung schreiben ---------- */
  function neuerEntwurf(vid) {
    var v = vorlage(vid) || { id: 'frei', positionen: [{ text: '', menge: 1, preis: 0 }] };
    var k = v.kunde ? D.kunden.find(function (x) { return x.kurz === v.kunde; }) : null;
    var vm = vormonat(L.heute());
    return {
      id: null, vorlage: v.id, kunde_id: k ? k.id : null, datum: L.datum(L.heute()), kd: kdAusKunde(k), mengeLabel: v.mengeLabel || 'Menge',
      felder: { von: vm.von, bis: vm.bis, zeitraum: vm.zeitraum, termine: '', km: '', strecke: '', leistungszeitraum: v.id === 'frei' ? L.MONATE[vm.monat.monat] + ' ' + vm.monat.jahr : '' },
      positionen: v.positionen.map(function (p) { return { vorlage: p.text, text: '', menge: p.menge, preis: p.preis, manuell: false }; }), notiz: ''
    };
  }
  function ausAusgang(a) {
    var e = a.empfaenger || kdAusKunde(kunde(a.kunde_id));
    return {
      id: a.id, vorlage: a.vorlage || 'frei', kunde_id: a.kunde_id, datum: L.datum(a.datum), kd: Object.assign(kdAusKunde(kunde(a.kunde_id)), e, { ziel: a.ziel }), mengeLabel: (vorlage(a.vorlage) || {}).mengeLabel || 'Menge',
      felder: Object.assign({ von: '', bis: '', zeitraum: '', termine: '', km: '', strecke: '', leistungszeitraum: '' }, (a.empfaenger && a.empfaenger.felder) || {}),
      positionen: (Array.isArray(a.positionen) ? a.positionen : []).map(function (p) {
        var felder = (a.empfaenger && a.empfaenger.felder) || {};
        return { vorlage: p.vorlage || '', text: p.text, menge: p.menge, preis: p.preis !== undefined ? p.preis : p.ep, reise: !!p.reise, manuell: !p.vorlage || R.fuellen(p.vorlage, felder) !== p.text };
      }),
      notiz: a.notiz || ''
    };
  }
  function fuellen(st) {
    st.positionen.forEach(function (p) { if (!p.manuell) p.text = R.fuellen(p.vorlage, st.felder); });
    if (st.vorlage === 'schulung') {
      var n = Number(L.parse(st.positionen[0] && st.positionen[0].menge)) || 0;
      st.positionen.forEach(function (p) { if (/Administrationspauschale/.test(p.vorlage || p.text)) p.menge = n; });
      st.positionen = st.positionen.filter(function (p) { return !p.reise; });
      var km = L.parse(st.felder.km);
      if (km > 0) st.positionen.splice(1, 0, { reise: true, manuell: true, text: 'Reisekosten ' + (st.felder.strecke ? st.felder.strecke + ', ' : '') + String(km).replace('.', ',') + ' km (€ 0,50/km)', menge: 1, preis: L.r2(km * 0.5) });
    }
    var lz = st.vorlage === 'frei' && st.felder.leistungszeitraum ? st.felder.leistungszeitraum.trim() : '';
    var pos = st.positionen.map(function (p, i) {
      var t = p.text || '';
      if (lz && i === 0 && t && !/Leistungszeitraum/i.test(t)) t += '\nLeistungszeitraum: **' + lz + '**';
      return { text: t, menge: Number(L.parse(p.menge)) || 0, preis: Number(L.parse(p.preis)) || 0 };
    });
    var s = R.summen(pos);
    st.pos = pos; st.netto = s.netto; st.ust = s.ust; st.brutto = s.brutto;
    return st;
  }
  function fehlendeKd(kd) { return [['name1', 'Name'], ['strasse', 'Straße'], ['ort', 'PLZ und Ort'], ['mail', 'E-Mail'], ['uid', 'UID']].filter(function (x) { return !String(kd[x[0]] || '').trim(); }).map(function (x) { return x[1]; }); }

  APP.V.rechnung = {
    titel: 'Rechnung',
    render: function (arg) {
      var t = String(arg || '').split('/');
      if (t[0] === 'neu') { if (!S.re || S.re._key !== arg) { S.re = neuerEntwurf(t[1]); S.re._key = arg; } }
      else {
        var a = D.ausgang.find(function (x) { return x.id === t[0]; });
        if (!a) return '<div class="card">Rechnung nicht gefunden. <button class="btn" data-go="ausgang">Zurück</button></div>';
        if (!a.entwurf) return ansicht(a);
        if (!S.re || S.re.id !== a.id) { S.re = ausAusgang(a); S.re._key = arg; }
      }
      var st = fuellen(S.re), fe = fehlendeKd(st.kd);
      var kOpts = D.kunden.filter(function (k) { return k.aktiv || k.id === st.kunde_id; }).map(function (k) { return '<option value="' + k.id + '"' + (k.id === st.kunde_id ? ' selected' : '') + '>' + h(k.kurz) + '</option>'; }).join('') + '<option value=""' + (!st.kunde_id ? ' selected' : '') + '>Neuer Kunde …</option>';
      var feld = function (k, l, ph, mode) { return '<label class="f">' + l + '<input class="in" data-re="felder.' + k + '" value="' + h(st.felder[k] || '') + '" placeholder="' + h(ph || '') + '"' + (mode ? ' inputmode="' + mode + '"' : '') + '></label>'; };
      var felder = '';
      if (st.vorlage === 'ifms') felder = feld('von', 'Zeitraum von', 'TT.MM.JJJJ') + feld('bis', 'Zeitraum bis', 'TT.MM.JJJJ');
      else if (st.vorlage === 'oegk') felder = feld('zeitraum', 'Zeitraum', '01. Nov – 30. Nov. 2026');
      else if (st.vorlage === 'schulung') felder = '<div class="span2">' + feld('termine', 'Termine und Ort', 'z. B. 03.12.2026, Online; 10.12.2026, LS Linz') + '</div>' + feld('strecke', 'Reisestrecke, wenn vor Ort', 'z. B. Wien – Linz – Wien') + feld('km', 'Kilometer', 'z. B. 370', 'decimal');
      else felder = '<div class="span2">' + feld('leistungszeitraum', 'Leistungszeitraum', 'z. B. November 2026') + '</div>';
      var pos = st.positionen.map(function (p, i) {
        return '<div class="card" style="background:#F8F9F6;padding:12px"><label class="f">Position ' + (i + 1) + (p.reise ? ' (aus den Kilometern)' : '') + '<textarea class="in" data-re="pos.' + i + '.text" rows="4"' + (p.reise ? ' disabled' : '') + '>' + h(String(p.text || '').replace(/\*\*/g, '')) + '</textarea></label>' + (!p.manuell && /\{/.test(p.vorlage || '') ? '<span class="s">Fett gedruckt werden die Angaben oben (Zeitraum, Termine).</span>' : '') +
          '<div class="grid"><label class="f">' + (i === 0 && st.vorlage === 'schulung' ? 'Anzahl Schulungen' : st.mengeLabel || 'Menge') + '<input class="in" inputmode="decimal" data-re="pos.' + i + '.menge" value="' + h(String(p.menge).replace('.', ',')) + '"' + (p.reise || (st.vorlage === 'schulung' && i > 0) ? ' disabled' : '') + '></label>' +
          '<label class="f">Einzelpreis netto €<input class="in" inputmode="decimal" data-re="pos.' + i + '.preis" value="' + h(L.fmt(p.preis)) + '"' + (p.reise ? ' disabled' : '') + '></label>' +
          (!p.reise && st.positionen.length > 1 ? '<div style="align-self:end"><button type="button" class="btn small ghost" data-act="re-pos-weg" data-i="' + i + '">Entfernen</button></div>' : '') + '</div></div>';
      }).join('');
      var kdFelder = KD_FELDER.map(function (f) { return '<label class="f">' + f[1] + '<input class="in' + (fe.indexOf({ name1: 'Name', strasse: 'Straße', ort: 'PLZ und Ort', mail: 'E-Mail', uid: 'UID' }[f[0]]) >= 0 ? ' bad' : '') + '" data-re="kd.' + f[0] + '" placeholder="' + h(f[2]) + '" value="' + h(st.kd[f[0]] === undefined ? '' : st.kd[f[0]]) + '"></label>'; }).join('');
      return '<div class="top"><div><h1>' + (st.id ? 'Entwurf' : 'Neue Rechnung') + ' · ' + h((vorlage(st.vorlage) || {}).label || 'Rechnung') + '</h1><div class="s">Die Nummer bekommt die Rechnung erst beim Ausstellen.</div></div><div class="acts"><button type="button" class="btn ghost" data-act="re-abbrechen">Zurück</button></div></div>' +
        '<div class="cols"><div class="wide" style="flex-basis:420px;display:flex;flex-direction:column;gap:14px">' +
        '<div class="card"><div class="grid"><label class="f">Kunde<select class="in" data-re="kunde_id">' + kOpts + '</select></label><label class="f">Rechnungsdatum<input class="in" data-re="datum" value="' + h(st.datum) + '" placeholder="TT.MM.JJJJ"></label>' + felder + '</div></div>' +
        '<div class="card"><div class="head"><h2>Positionen</h2><button type="button" class="btn small" data-act="re-pos-neu">+ Position</button></div>' + pos + '</div>' +
        '<details class="card"' + (fe.length ? ' open' : '') + '><summary style="cursor:pointer;font-weight:600">Kundendaten' + (fe.length ? ' <span class="chip warn">fehlt: ' + fe.join(', ') + '</span>' : ' <span class="s">(werden beim Kunden gespeichert)</span>') + '</summary><div class="grid g2" style="margin-top:10px">' + kdFelder + '</div></details>' +
        '<label class="f">Interne Notiz (nicht auf der Rechnung)<input class="in" data-re="notiz" value="' + h(st.notiz) + '"></label>' +
        '<div id="re-fehler"></div>' +
        '<div class="chips"><button type="button" class="btn pri" data-act="re-ausstellen">Rechnung ausstellen</button><button type="button" class="btn" data-act="re-entwurf">Als Entwurf speichern</button><button type="button" class="btn" data-act="re-pdf-vorschau">PDF-Vorschau</button>' + (st.id ? '<button type="button" class="btn danger" data-act="re-entwurf-weg">Entwurf löschen</button>' : '') + '</div>' +
        '</div><div class="narrow" style="flex-basis:520px"><div id="inv-vorschau">' + vorschauHtml(st) + '</div></div></div>';
    }
  };
  function vorschauHtml(st) {
    var f = D.einst.firma || {}, kd = st.kd;
    var nr = st.id && D.ausgang.find(function (a) { return a.id === st.id; }) || {};
    var posT = st.pos.map(function (p, i) { return '<tr><td>' + L.p2(i + 1) + '</td><td>' + h(p.text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</td><td class="rr">' + String(p.menge).replace('.', ',') + '</td><td class="rr">€ ' + L.fmt(p.preis) + '</td><td class="rr">€ ' + L.fmt(p.menge * p.preis) + '</td></tr>'; }).join('');
    return '<div class="inv"><div class="ih"><img src="logo.png" alt="S1 Secure"><div class="adr">' + h(f.ort) + '<br>' + h(f.strasse) + '<br>T: ' + h(f.tel) + '<br>M: ' + h(f.mail) + '</div></div>' +
      '<div style="margin:16px 0 10px"><b>' + h(kd.name1 || '…') + '</b>' + (kd.name2 ? '<br><b>' + h(kd.name2) + '</b>' : '') + '<br>' + h(kd.strasse || '…') + '<br>' + h(kd.ort || '…') + (kd.mail ? '<br>Per E-Mail an: &nbsp; ' + h(kd.mail) : '') + '</div>' +
      '<div style="text-align:right">Seite 1/1</div><p>Wie vereinbart, dürfen wir Ihnen wie folgt in Rechnung stellen:</p>' +
      '<table><tr><td><b>Rechnungsnummer</b></td><td colspan="2"><b>' + h(nr.nr || 'wird beim Ausstellen vergeben') + '</b></td></tr><tr><td><b>Rechnungsdatum</b></td><td colspan="2">' + h(st.datum) + '</td></tr><tr><td><b>Bestellnummer</b></td><td colspan="2"><b>' + h(kd.bestellnr || '') + '</b></td></tr><tr><td><b>Ansprechpartner</b></td><td>' + h(kd.ansprech || '') + '</td><td>' + (kd.uid ? 'Ihre UID Nr.: ' + h(kd.uid) : '') + '</td></tr></table>' +
      '<table><tr><th>Pos:</th><th>Beschreibung</th><th>' + h(st.mengeLabel || 'Menge') + '</th><th>Einzelpreis netto (Euro)</th><th>Gesamtpreis netto (Euro)</th></tr>' + posT +
      '<tr><td colspan="4">Summe (netto)</td><td class="rr">€ ' + L.fmt(st.netto) + '</td></tr><tr><td colspan="4">zzgl. 20% USt</td><td class="rr">€ ' + L.fmt(st.ust) + '</td></tr><tr><td colspan="4"><b>Gesamtbetrag (brutto)</b></td><td class="rr"><b>€ ' + L.fmt(st.brutto) + '</b></td></tr></table>' +
      '<p>Zahlbar (brutto) ohne Abzüge binnen ' + h(kd.ziel || 14) + ' Tagen ab Rechnungserhalt</p><p>Bankverbindung<br>Inhaber: ' + h(f.inhaber) + ' | Bank ' + h(f.bank) + ' | IBAN: ' + (f.iban ? h(f.iban) : '<b style="color:#A0221A">fehlt in den Einstellungen</b>') + ' | BIC: ' + h(f.bic) + '</p></div>';
  }
  /* Eingaben ins Formular übernehmen, ohne die Seite neu aufzubauen */
  function setze(pfad, wert) {
    var st = S.re, p = pfad.split('.');
    if (p[0] === 'pos') { var pos = st.positionen[+p[1]]; pos[p[2]] = wert; if (p[2] === 'text') pos.manuell = true; }
    else if (p[0] === 'felder') st.felder[p[1]] = wert;
    else if (p[0] === 'kd') st.kd[p[1]] = wert;
    else st[p[0]] = wert;
  }
  var tick = null;
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-re]'); if (!el || !S.re) return;
    setze(el.dataset.re, el.value);
    clearTimeout(tick);
    tick = setTimeout(function () {
      fuellen(S.re);
      APP.$$('[data-re$=".text"]').forEach(function (t) { var i = +t.dataset.re.split('.')[1], p = S.re.positionen[i]; if (p && !p.manuell && document.activeElement !== t) t.value = String(p.text || '').replace(/\*\*/g, ''); });
      var v = document.getElementById('inv-vorschau'); if (v) v.innerHTML = vorschauHtml(S.re);
    }, 150);
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-re="kunde_id"]'); if (!el || !S.re) return;
    S.re.kunde_id = el.value || null; S.re.kd = kdAusKunde(kunde(el.value)); APP.render();
  });
  APP.A['re-pos-neu'] = function () { S.re.positionen.push({ vorlage: '', text: '', menge: 1, preis: 0, manuell: true }); APP.render(); };
  APP.A['re-pos-weg'] = function (el) { S.re.positionen.splice(+el.dataset.i, 1); APP.render(); };
  APP.A['re-abbrechen'] = function () { S.re = null; APP.go('ausgang'); };

  function pruefen(st, ausstellen) {
    var e = [];
    var d = L.isoAus(st.datum);
    if (!d) e.push('Bitte das Rechnungsdatum als TT.MM.JJJJ eingeben.');
    if (st.netto <= 0) e.push('Bitte Menge und Preis eintragen.');
    if (st.pos.some(function (p) { return !String(p.text).trim() || /…/.test(p.text); })) e.push('Bitte alle Positionen und Felder (Zeitraum, Termine) ausfüllen.');
    if (!st.kd.name1.trim() || !st.kd.strasse.trim() || !st.kd.ort.trim()) e.push('Bitte Name und Adresse des Kunden ausfüllen.');
    if (st.brutto > 10000 && !/^[A-Z]{2}[0-9A-Z]{8,12}$/.test(String(st.kd.uid).replace(/\s/g, '').toUpperCase())) e.push('Über 10.000 € brutto braucht die Rechnung die UID des Kunden.');
    if (ausstellen && !(D.einst.firma || {}).iban) e.push('In den Einstellungen fehlt noch deine IBAN für die Bankverbindung.');
    if (ausstellen && d && L.tageBis(d) > 31) e.push('Das Rechnungsdatum liegt mehr als einen Monat in der Zukunft.');
    var box = document.getElementById('re-fehler');
    if (box) box.innerHTML = e.length ? '<div class="note bad">' + e.map(h).join('<br>') + '</div>' : '';
    return e.length === 0 ? d : null;
  }
  function speichernEntwurf(st, d) {
    var k = kunde(st.kunde_id);
    var kd = Object.assign({}, st.kd); kd.uid = String(kd.uid || '').replace(/\s/g, '').toUpperCase(); kd.mail = String(kd.mail || '').trim();
    var row = {
      jahr: +d.slice(0, 4), datum: d, kunde_id: st.kunde_id, kunde: k ? k.kurz : (kd.name1 || 'Kunde'), vorlage: st.vorlage,
      empfaenger: { name1: kd.name1, name2: kd.name2, name2Bold: true, strasse: kd.strasse, ort: kd.ort, mail: kd.mail, bestellnr: kd.bestellnr, ansprech: kd.ansprech, uid: kd.uid, felder: st.felder },
      positionen: st.positionen.map(function (p, i) { return { text: st.pos[i].text, menge: st.pos[i].menge, preis: st.pos[i].preis, vorlage: p.vorlage || null, reise: !!p.reise }; }),
      zeitraum: st.felder.zeitraum || (st.felder.von ? st.felder.von + ' – ' + st.felder.bis : st.felder.leistungszeitraum || null),
      netto: st.netto, ust: st.ust, brutto: st.brutto, ziel: Number(st.kd.ziel) || 14, notiz: st.notiz || null, entwurf: true, quelle: 'app'
    };
    /* Kundendaten beim Kunden speichern (neu oder geändert) */
    var kRow = { name1: kd.name1, name2: kd.name2, strasse: kd.strasse, ort: kd.ort, mail: kd.mail, bestellnr: kd.bestellnr, ansprech: kd.ansprech, uid: kd.uid, ziel: Number(kd.ziel) || 14 };
    var kJob;
    if (k) { var anders = Object.keys(kRow).some(function (f) { return String(k[f] || '') !== String(kRow[f] || ''); }); kJob = anders ? APP.upd('kunden', { id: k.id }, kRow) : Promise.resolve(); }
    else kJob = APP.ins('kunden', [Object.assign({ kurz: (kd.name1 || 'Kunde').slice(0, 30), aktiv: true }, kRow)]).then(function (r) { st.kunde_id = r[0].id; row.kunde_id = r[0].id; row.kunde = r[0].kurz; });
    return kJob.then(function () { return st.id ? APP.upd('ausgang', { id: st.id }, row) : APP.ins('ausgang', [row]); }).then(function (r) { st.id = r[0].id; return r[0]; });
  }
  APP.A['re-entwurf'] = function (el) {
    var st = fuellen(S.re), d = pruefen(st, false); if (!d) return;
    APP.lauf(el, function () { return speichernEntwurf(st, d).then(function (a) { APP.toast('Entwurf gespeichert.'); S.re = null; APP.go('rechnung/' + a.id); }); });
  };
  APP.A['re-entwurf-weg'] = function () {
    APP.bestaetigen('Den Entwurf löschen? Er hat noch keine Nummer, es entsteht keine Lücke.', 'Löschen', { danger: true }).then(function (ok) {
      if (!ok) return; return APP.del('ausgang', { id: S.re.id }).then(function () { S.re = null; APP.toast('Entwurf gelöscht.'); APP.go('ausgang'); });
    }).catch(APP.fehler);
  };
  function logo() { return fetch('logo.png').then(function (r) { return r.arrayBuffer(); }).catch(function () { return null; }); }
  function pdfLib() {
    if (window.PDFLib) return Promise.resolve();
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'js/lib/pdf-lib.min.js'; s.onload = res; s.onerror = function () { rej(new Error('PDF-Baustein konnte nicht geladen werden.')); }; document.head.appendChild(s); });
  }
  function pdfBauen(a) {
    var f = D.einst.firma || {};
    return Promise.all([pdfLib(), logo()]).then(function (r) {
      var e = a.empfaenger || {};
      return R.pdf(Object.assign({}, a, { mengeLabel: (vorlage(a.vorlage) || {}).mengeLabel, empfaenger: e }), f, r[1]);
    }).then(function (bytes) { return new Blob([bytes], { type: 'application/pdf' }); });
  }
  APP.rechnungPdf = pdfBauen;
  APP.A['re-pdf-vorschau'] = function (el) {
    var st = fuellen(S.re), d = L.isoAus(st.datum) || L.heute();
    var w = window.open('about:blank', '_blank');
    APP.lauf(el, function () {
      return pdfBauen({ nr: 'Entwurf', datum: d, ziel: st.kd.ziel, positionen: st.pos, netto: st.netto, ust: st.ust, brutto: st.brutto, vorlage: st.vorlage, empfaenger: st.kd }).then(function (b) { var u = URL.createObjectURL(b); if (w) w.location = u; else APP.speichernUnter(b, 'Entwurf.pdf'); });
    });
  };
  APP.A['re-ausstellen'] = function (el) {
    var st = fuellen(S.re), d = pruefen(st, true); if (!d) return;
    APP.bestaetigen('Rechnung an <b>' + h(st.kd.name1) + '</b> über <b>' + L.eur(st.brutto) + '</b> mit Datum ' + L.datum(d) + ' ausstellen? Sie bekommt dann die nächste fortlaufende Nummer und lässt sich nicht mehr löschen, nur stornieren.', 'Ausstellen').then(function (ok) {
      if (!ok) return;
      return APP.lauf(el, function () {
        return speichernEntwurf(st, d).then(function (a) {
          return APP.rpc('rechnung_ausstellen', { p_id: a.id }).then(function () { return APP.sb.from('ausgang').select('*').eq('id', a.id).single(); }).then(function (r) { if (r.error) throw r.error; APP.merge('ausgang', [r.data]); return r.data; });
        }).then(function (a) {
          return pdfBauen(a).then(function (blob) {
            var path = a.jahr + '/Re_' + String(a.nr).replace('/', '-') + '_' + a.kunde.replace(/[^\wÄÖÜäöüß.-]+/g, '-') + '_' + Date.now().toString(36) + '.pdf';
            return APP.hochladen('rechnungen', path, blob, 'application/pdf').then(function () { return APP.upd('ausgang', { id: a.id }, { datei: path }); }).then(function () { return { a: a, blob: blob }; });
          });
        }).then(function (x) {
          S.re = null; APP.toast('Rechnung ' + x.a.nr + ' ausgestellt.');
          APP.go('rechnung/' + x.a.id);
          setTimeout(function () { sendenDialog(D.ausgang.find(function (y) { return y.id === x.a.id; }), x.blob); }, 200);
        });
      });
    });
  };

  /* ---------- Ansicht einer ausgestellten Rechnung ---------- */
  function ansicht(a) {
    var z = zustand(a), bk = D.bank.find(function (b) { return b.ausgang_id === a.id; });
    var pos = (Array.isArray(a.positionen) ? a.positionen : []).map(function (p) { return '<div class="item" style="padding:8px 0"><div class="grow"><span>' + h(String(p.text || '').replace(/\*\*/g, '')) + '</span></div><span class="amt">' + String(p.menge).replace('.', ',') + ' × ' + L.fmt(p.preis !== undefined ? p.preis : p.ep) + '</span></div>'; }).join('');
    var e = a.empfaenger || {};
    return '<div class="top"><div><h1>Rechnung ' + h(a.nr) + '</h1><div class="chips" style="margin-top:6px"><span class="chip ' + z[1] + '">' + z[0] + '</span>' + (a.gesendet_am ? '<span class="chip">gesendet ' + L.datum(a.gesendet_am) + '</span>' : '') + (a.erinnert_am ? '<span class="chip">erinnert ' + L.datum(a.erinnert_am) + '</span>' : '') + '</div></div><div class="acts"><button type="button" class="btn ghost" data-go="ausgang">Zurück</button></div></div>' +
      '<div class="cols"><div class="wide"><div class="card"><div class="tiles"><div class="tile" style="background:#F8F9F6"><span class="k">' + h(a.kunde) + '</span><span class="v">' + L.eur(a.brutto) + '</span><span class="u">netto ' + L.eur(a.netto) + ' · USt ' + L.eur(a.ust) + '</span></div><div class="tile" style="background:#F8F9F6"><span class="k">Rechnungsdatum</span><span class="v">' + L.datum(a.datum) + '</span><span class="u">Ziel ' + a.ziel + ' Tage · fällig ' + L.datum(L.faelligAm(a)) + '</span></div></div>' +
      (e.name1 ? '<div class="s">' + h([e.name1, e.name2, e.strasse, e.ort].filter(Boolean).join(', ')) + (e.mail ? ' · ' + h(e.mail) : '') + '</div>' : '') +
      (pos ? '<div class="list">' + pos + '</div>' : '') + (a.zeitraum ? '<div class="s">Zeitraum: ' + h(a.zeitraum) + '</div>' : '') +
      (bk ? '<div class="note ok">Zahlung eingelangt am ' + L.datum(bk.datum) + ': ' + L.eur(bk.betrag) + '</div>' : a.bezahlt_betrag !== null && a.bezahlt_betrag !== undefined && !a.bezahlt_am ? '<div class="note">Laut deiner Liste bezahlt; der Kontoauszug bestätigt es, sobald er eingelesen ist.</div>' : '') +
      (a.notiz ? '<div class="note">' + h(a.notiz) + '</div>' : '') +
      '<div class="chips">' + (a.datei ? '<button type="button" class="btn" data-act="re-pdf" data-id="' + a.id + '">PDF öffnen</button><button type="button" class="btn pri" data-act="re-senden" data-id="' + a.id + '">Senden</button>' : '<button type="button" class="btn" data-act="re-pdf-hoch" data-id="' + a.id + '">PDF hinzufügen</button>') +
      (L.offen(a) ? '<button type="button" class="btn" data-act="re-bezahlt" data-id="' + a.id + '">Bezahlt eintragen</button><button type="button" class="btn' + (L.tageBis(L.faelligAm(a)) < 0 ? ' blue' : '') + '" data-act="re-erinnern" data-id="' + a.id + '">Zahlungserinnerung</button>' : '') +
      (!a.storniert ? '<button type="button" class="btn danger" data-act="re-storno" data-id="' + a.id + '">Stornieren</button>' : '') + '<button type="button" class="btn ghost" data-act="re-notiz" data-id="' + a.id + '">Notiz</button></div>' +
      '</div></div><div class="narrow"><div id="re-pdf-box" class="card" style="padding:8px">' + (a.datei ? '<span class="spin"></span>' : '<div class="empty">Kein PDF in der App. Bei älteren Rechnungen liegt es in deinem Ordner; du kannst es mit „PDF hinzufügen“ ablegen.</div>') + '</div></div></div>';
  }
  APP.V.rechnung.after = function (arg) {
    var a = D.ausgang.find(function (x) { return x.id === String(arg).split('/')[0]; });
    if (!a || a.entwurf || !a.datei) return;
    APP.dateiUrl('rechnungen', a.datei).then(function (u) { var b = document.getElementById('re-pdf-box'); if (b) b.innerHTML = '<iframe class="vorschau-datei" style="height:640px" src="' + h(u) + '#view=FitH" title="Rechnung ' + h(a.nr) + '"></iframe>'; });
  };
  function ausId(el) { return D.ausgang.find(function (x) { return x.id === el.dataset.id; }); }
  APP.A['re-pdf'] = function (el) { APP.oeffnen('rechnungen', ausId(el).datei); };
  APP.A['re-pdf-hoch'] = function (el) {
    var a = ausId(el), i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf';
    i.onchange = function () {
      if (!i.files.length) return;
      var path = a.jahr + '/Re_' + String(a.nr).replace('/', '-') + '_' + a.kunde.replace(/[^\wÄÖÜäöüß.-]+/g, '-') + '_' + Date.now().toString(36) + '.pdf';
      APP.hochladen('rechnungen', path, i.files[0], 'application/pdf').then(function () { return APP.upd('ausgang', { id: a.id }, { datei: path }); }).then(function () { APP.toast('PDF abgelegt.'); APP.render(); }).catch(APP.fehler);
    };
    i.click();
  };
  function mailText(a, art) {
    var e = a.empfaenger || {}, f = D.einst.firma || {};
    if (art === 'erinnerung') return 'Sehr geehrte Damen und Herren,\n\nzu meiner Rechnung ' + a.nr + ' vom ' + L.datum(a.datum) + ' über ' + L.eur(a.brutto) + (e.bestellnr ? ' (Bestellnummer ' + e.bestellnr + ')' : '') + ' konnte ich bisher keinen Zahlungseingang feststellen. Ich ersuche um Überweisung bis ' + L.datum(L.plusTage(L.heute(), 10)) + '.\n\nSollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.\n\nMit freundlichen Grüßen\n' + (f.inhaber || '') + '\n' + (f.name || '');
    return 'Sehr geehrte Damen und Herren,\n\nanbei übermittle ich Ihnen meine Rechnung ' + a.nr + ' vom ' + L.datum(a.datum) + ' über ' + L.eur(a.brutto) + (e.bestellnr ? ' (Bestellnummer ' + e.bestellnr + ')' : '') + '.\n\nMit freundlichen Grüßen\n' + (f.inhaber || '') + '\n' + (f.name || '');
  }
  function sendenDialog(a, blob) {
    var e = a.empfaenger || {}, betreff = 'Rechnung ' + a.nr + ' – ' + ((D.einst.firma || {}).name || 'S1 Secure e.U.'), text = mailText(a, 'rechnung');
    var name = 'Rechnung_' + String(a.nr).replace('/', '-') + '_S1-Secure.pdf';
    APP.modal({
      title: 'Rechnung ' + a.nr + ' senden',
      body: '<div class="grid g2"><label class="f">An<input class="in" id="m-an" value="' + h(e.mail || '') + '"></label><label class="f">Betreff<input class="in" id="m-betreff" value="' + h(betreff) + '"></label></div><label class="f">Text<textarea class="in" id="m-text" rows="8">' + h(text) + '</textarea></label>' +
        '<p class="s" style="margin:0">„Teilen“ öffnet am Handy oder unter Windows das Mailprogramm mit dem PDF im Anhang. „Mail vorbereiten“ lädt das PDF herunter und öffnet eine neue Mail; das PDF dort anhängen.</p>',
      foot: '<div class="left"><button type="button" class="btn" id="m-pdf">PDF herunterladen</button></div><button type="button" class="btn" id="m-mail">Mail vorbereiten</button><button type="button" class="btn pri" id="m-teilen">Teilen</button>'
    });
    var holen = function () { return blob ? Promise.resolve(blob) : APP.herunterladen('rechnungen', a.datei).then(function (b) { blob = b; return b; }); };
    var gesendet = function () { return APP.upd('ausgang', { id: a.id }, { gesendet_am: L.heute() }).then(function () { APP.render(); }); };
    document.getElementById('m-pdf').onclick = function () { holen().then(function (b) { APP.speichernUnter(b, name); }).catch(APP.fehler); };
    document.getElementById('m-mail').onclick = function () {
      holen().then(function (b) {
        APP.speichernUnter(b, name);
        location.href = 'mailto:' + encodeURIComponent(document.getElementById('m-an').value) + '?subject=' + encodeURIComponent(document.getElementById('m-betreff').value) + '&body=' + encodeURIComponent(document.getElementById('m-text').value);
        return gesendet();
      }).catch(APP.fehler);
    };
    var t = document.getElementById('m-teilen');
    t.onclick = function () {
      holen().then(function (b) {
        var file = new File([b], name, { type: 'application/pdf' });
        if (!(navigator.canShare && navigator.canShare({ files: [file] }))) { APP.toast('Teilen geht in diesem Browser nicht. Bitte „Mail vorbereiten“ verwenden.', { bad: true }); return; }
        return navigator.share({ files: [file], title: document.getElementById('m-betreff').value, text: document.getElementById('m-text').value }).then(function () { APP.schliessen(); return gesendet(); }, function () {});
      }).catch(APP.fehler);
    };
  }
  APP.A['re-senden'] = function (el) { sendenDialog(ausId(el)); };
  APP.A['re-erinnern'] = function (el) {
    var a = ausId(el), e = a.empfaenger || {}, text = mailText(a, 'erinnerung');
    APP.modal({
      title: 'Zahlungserinnerung ' + a.nr, body: '<label class="f">Text<textarea class="in" id="er-text" rows="10">' + h(text) + '</textarea></label>',
      foot: '<button type="button" class="btn" id="er-kopie">Kopieren</button><button type="button" class="btn pri" id="er-mail">Mail öffnen</button>'
    });
    var fertig = function () { return APP.upd('ausgang', { id: a.id }, { erinnert_am: L.heute() }).then(function () { APP.render(); }); };
    document.getElementById('er-kopie').onclick = function () { navigator.clipboard.writeText(document.getElementById('er-text').value).then(function () { APP.toast('Kopiert.'); return fertig(); }).catch(APP.fehler); };
    document.getElementById('er-mail').onclick = function () { location.href = 'mailto:' + encodeURIComponent(e.mail || '') + '?subject=' + encodeURIComponent('Zahlungserinnerung Rechnung ' + a.nr) + '&body=' + encodeURIComponent(document.getElementById('er-text').value); fertig(); };
  };
  APP.A['re-bezahlt'] = function (el) {
    var a = ausId(el);
    APP.modal({
      title: 'Zahlung ' + a.nr, body: '<p class="s" style="margin:0">Normalerweise trägt die App das aus dem Kontoauszug ein.</p><div class="grid"><label class="f">Eingelangt am<input class="in" id="bz-d" value="' + L.datum(L.heute()) + '"></label><label class="f">Betrag €<input class="in" id="bz-b" inputmode="decimal" value="' + L.fmt(a.brutto) + '"></label></div>',
      foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn pri" id="bz-ok">Speichern</button>'
    });
    document.getElementById('bz-ok').onclick = function () {
      var d = L.isoAus(document.getElementById('bz-d').value), b = L.parse(document.getElementById('bz-b').value);
      if (!d || !isFinite(b)) { APP.toast('Bitte Datum und Betrag prüfen.', { bad: true }); return; }
      APP.upd('ausgang', { id: a.id }, { bezahlt_am: d, bezahlt_betrag: L.r2(b) }).then(function () { APP.schliessen(); APP.toast('Zahlung eingetragen.'); APP.render(); }).catch(APP.fehler);
    };
  };
  APP.A['re-storno'] = function (el) {
    var a = ausId(el);
    APP.modal({
      title: 'Rechnung ' + a.nr + ' stornieren', body: '<p style="margin:0">Die Nummer bleibt vergeben und erscheint in der Liste als storniert. Wurde die Rechnung schon verschickt, braucht der Kunde zusätzlich eine Gutschrift bzw. Stornorechnung; das bitte mit CNC abstimmen.</p><label class="f">Grund<input class="in" id="st-grund" autofocus></label>',
      foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn danger" id="st-ok">Stornieren</button>'
    });
    document.getElementById('st-ok').onclick = function () {
      var g = document.getElementById('st-grund').value.trim();
      if (!g) { APP.toast('Bitte einen Grund eintragen.', { bad: true }); return; }
      APP.upd('ausgang', { id: a.id }, { storniert: true, notiz: 'Storniert: ' + g + (a.notiz ? ' · ' + a.notiz : '') }).then(function () { APP.schliessen(); APP.toast('Storniert.'); APP.render(); }).catch(APP.fehler);
    };
  };
  APP.A['re-notiz'] = function (el) {
    var a = ausId(el);
    APP.modal({ title: 'Notiz ' + a.nr, body: '<label class="f">Notiz<textarea class="in" id="nz" autofocus>' + h(a.notiz || '') + '</textarea></label>', foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn pri" id="nz-ok">Speichern</button>' });
    document.getElementById('nz-ok').onclick = function () { APP.upd('ausgang', { id: a.id }, { notiz: document.getElementById('nz').value || null }).then(function () { APP.schliessen(); APP.render(); }).catch(APP.fehler); };
  };
})();
