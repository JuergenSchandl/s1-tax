/* S1 Tax · Umsatzsteuer, Steuertermine, Rücklage und Jahresvorschau */
(function () {
  'use strict';
  var APP = window.APP, L = window.L, D = APP.D, S = APP.S, h = APP.h;

  var KZ = [
    ['000', 'Gesamtbetrag der Lieferungen und sonstigen Leistungen (netto)'],
    ['022', 'davon zu versteuern mit 20 % (Bemessungsgrundlage)'],
    ['057', 'Steuerschuld nach § 19 Abs. 1 (Reverse Charge), Steuerbetrag'],
    ['070', 'Innergemeinschaftliche Erwerbe, Gesamtbetrag'],
    ['072', 'davon 20 %, Steuerbetrag'],
    ['060', 'Gesamtbetrag der Vorsteuern'],
    ['065', 'Vorsteuern aus dem innergemeinschaftlichen Erwerb'],
    ['066', 'Vorsteuern aus Reverse Charge (§ 19 Abs. 1)']
  ];
  function uvaStatus(u) {
    if (u.bezahlt) return '<span class="chip ok">bezahlt' + (u.zahlung ? ' ' + L.datumKurz(u.zahlung.datum) : '') + '</span>';
    if (u.zahllast <= 0 && u.gemeldet) return '<span class="chip ok">gemeldet</span>';
    if (u.gemeldet) return '<span class="chip blue">gemeldet</span>';
    var t = L.tageBis(u.faellig);
    if (t < 0) return '<span class="chip bad">fällig seit ' + (-t) + ' T.</span>';
    return '<span class="chip">offen</span>';
  }
  APP.V.uva = {
    titel: 'Umsatzsteuer',
    render: function (arg) {
      var x = APP.jm(arg), j = x.jahr, m = x.monat; S.jahr = j; S.monat = m;
      var heute = L.heute(), bisMonat = j < +heute.slice(0, 4) ? 12 : j > +heute.slice(0, 4) ? 0 : +heute.slice(5, 7);
      var rows = '', sum = { k000: 0, ust: 0, k060: 0, k057: 0, zl: 0 };
      for (var i = 1; i <= Math.max(bisMonat, 1); i++) {
        var u = L.uva(D, j, i);
        sum.k000 += u.kz['000']; sum.ust += u.ust; sum.k060 += u.kz['060']; sum.k057 += u.kz['057']; sum.zl += u.zahllast;
        rows += '<tr class="click' + (i === m ? ' neu' : '') + '" data-go="uva/' + j + '-' + i + '"><td>' + L.MONATE[i] + (i === bisMonat ? ' <span class="s">läuft</span>' : '') + '</td><td class="r num">' + L.fmt(u.kz['000']) + '</td><td class="r num hm">' + L.fmt(u.ust) + '</td><td class="r num">' + L.fmt(u.kz['060']) + '</td><td class="r num hm">' + (u.kz['057'] ? L.fmt(u.kz['057']) : '–') + '</td><td class="r num"><b>' + L.fmt(u.zahllast) + '</b></td><td class="num hm">' + L.datum(u.faellig) + '</td><td>' + (i === bisMonat ? '' : uvaStatus(u)) + '</td></tr>';
      }
      var tab = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Monat</th><th class="r">Umsätze netto</th><th class="r hm">USt</th><th class="r">Vorsteuer</th><th class="r hm">RC</th><th class="r">Zahllast</th><th class="hm">fällig</th><th>Status</th></tr></thead><tbody>' + rows +
        '<tr class="sum"><td>Summe</td><td class="r num">' + L.fmt(sum.k000) + '</td><td class="r num hm">' + L.fmt(sum.ust) + '</td><td class="r num">' + L.fmt(sum.k060) + '</td><td class="r num hm">' + L.fmt(sum.k057) + '</td><td class="r num">' + L.fmt(sum.zl) + '</td><td class="hm"></td><td></td></tr></tbody></table></div>';
      return '<div class="top"><div><h1>Umsatzsteuer ' + j + '</h1><div class="s">Istbesteuerung: Umsätze zählen im Monat des Zahlungseingangs, Vorsteuer im Monat der Bezahlung.</div></div><div class="acts">' + APP.jahrWahl('uva', j, '-' + Math.min(m, 12)) + '</div></div>' +
        detail(j, m) + '<div class="card flat"><div class="head"><h2>Alle Monate ' + j + '</h2></div>' + tab + '</div>';
    }
  };
  function detail(j, m) {
    var u = L.uva(D, j, m), mo = L.monat(D, j, m) || {};
    var warn = [];
    var neu = L.gruppen(D.belege, function (b) { return b.jahr === j && b.monat === m && !b.storniert && !b.bestaetigt; }).length;
    var bank = D.bank.filter(function (b) { return b.jahr === j && b.monat === m && b.art === 'offen'; }).length;
    var hatBank = D.bank.some(function (b) { return b.jahr === j && b.monat === m; });
    if (!hatBank) warn.push('Der Kontoauszug für ' + L.MONATE[m] + ' fehlt noch. Ohne ihn fehlen Zahlungseingänge.');
    if (neu) warn.push(neu + ' Beleg(e) noch nicht bestätigt.');
    if (bank) warn.push(bank + ' Bankbuchung(en) ohne Beleg.');
    if (u.unklar.length) warn.push(u.unklar.length + ' Belegzeile(n) unklar, sind vorläufig mitgerechnet.');
    var kz = KZ.map(function (k) {
      var v = u.kz[k[0]];
      if (!v && ['057', '070', '072', '065', '066'].indexOf(k[0]) >= 0) return '';
      return '<span class="code">' + k[0] + '</span><span>' + k[1] + '</span><span class="val">' + L.fmt(v) + '</span><button type="button" class="btn small" data-act="kopieren" data-v="' + L.fmt(v).replace('−', '-') + '" aria-label="Wert ' + k[0] + ' kopieren">Kopieren</button>';
    }).join('');
    var gemeldet = u.gemeldet ? '<div class="note ok">Gemeldet am ' + L.datum(u.gemeldet) + (u.gemeldetBetrag !== null ? ' mit ' + L.eur(u.gemeldetBetrag) : '') + (u.gemeldetBetrag !== null && Math.abs(u.gemeldetBetrag - u.zahllast) > 0.005 ? ' · <b>heute berechnet ' + L.eur(u.zahllast) + '</b> (Nachträge seit der Meldung)' : '') + '</div>' : '';
    var bezahlt = u.bezahlt ? '<div class="note ok">Bezahlt' + (u.zahlung ? ' am ' + L.datum(u.zahlung.datum) + ': ' + L.eur(-u.zahlung.betrag) : u.bezahltBetrag !== null ? ': ' + L.eur(u.bezahltBetrag) : '') + (u.bezahltBetrag !== null && Math.abs(u.bezahltBetrag - u.zahllast) > 0.005 && u.zahllast > 0 ? ' · Abweichung zur Berechnung ' + L.eur(u.bezahltBetrag - u.zahllast) : '') + '</div>' : '';
    var liste = function (titel, arr, fn) { return arr.length ? '<h3>' + titel + '</h3><div class="list">' + arr.map(fn).join('') + '</div>' : ''; };
    var bel = function (b) { return '<button type="button" class="item" style="padding:8px 0" data-act="beleg" data-g="' + b.gruppe + '"><div class="grow"><span>' + h(b.lieferant) + ' <span class="s">' + (L.belegNr(b) || 'neu') + ' · ' + h(b.text) + '</span></span></div><span class="amt">' + L.fmt(b.netto) + '</span></button>'; };
    return '<div class="card"><div class="head"><div><h2>UVA ' + L.MONATE[m] + ' ' + j + '</h2><div class="s">fällig am ' + L.datum(u.faellig) + ' · Steuernummer ' + h((D.einst.steuer || {}).stnr || '') + '</div></div>' +
      '<div style="text-align:right"><div class="s">' + (u.zahllast < 0 ? 'Gutschrift' : 'Zahllast') + '</div><div style="font-family:var(--head);font-size:30px;font-weight:600">' + L.eur(Math.abs(u.zahllast)) + '</div></div></div>' +
      (warn.length ? '<div class="note warn">' + warn.join('<br>') + '</div>' : '') + gemeldet + bezahlt + (mo.notiz ? '<div class="note">' + h(mo.notiz) + '</div>' : '') +
      '<p class="s" style="margin:0">So eintragen: FinanzOnline → Eingaben → Anträge → Umsatzsteuervoranmeldung (U30) für ' + L.MONATE[m] + ' ' + j + '.</p>' +
      '<div class="kz">' + kz + '<span class="code">095</span><span><b>' + (u.zahllast < 0 ? 'Überschuss (Gutschrift)' : 'Zahllast') + '</b></span><span class="val"><b>' + L.fmt(u.zahllast) + '</b></span><span></span></div>' +
      (u.kz['057'] ? '<div class="note blue">Reverse Charge: ' + u.rc.length + ' Rechnung(en) ausländischer Firmen ohne österreichische USt. Steuer und Vorsteuer heben sich auf' + (u.kz['057'] !== u.kz['066'] ? ', außer beim Auto (kein Vorsteuerabzug)' : '') + '.</div>' : '') +
      '<div class="chips">' + (u.gemeldet ? '<button type="button" class="btn" data-act="uva-melden" data-j="' + j + '" data-m="' + m + '" data-aus="1">Meldung zurücknehmen</button>' : '<button type="button" class="btn pri" data-act="uva-melden" data-j="' + j + '" data-m="' + m + '">In FinanzOnline gemeldet</button>') +
      (!u.bezahlt && u.zahllast > 0 ? '<button type="button" class="btn" data-act="uva-bezahlt" data-j="' + j + '" data-m="' + m + '">Bezahlt eintragen</button>' : '') + '<button type="button" class="btn ghost" data-go="monat/' + j + '-' + m + '">Belege ansehen</button></div>' +
      liste('Umsätze (bezahlt in ' + L.MONATE[m] + ')', u.umsaetze, function (a) { return '<div class="item" style="padding:8px 0"><div class="grow"><span>Rechnung ' + h(a.nr) + ' · ' + h(a.kunde) + ' <span class="s">bezahlt ' + L.datum(a.bezahlt_am) + '</span></span></div><span class="amt">' + L.fmt(a.netto) + '</span></div>'; }) +
      liste('Reverse Charge', u.rc, bel) + liste('Innergemeinschaftlicher Erwerb', u.ig, bel) + '</div>';
  }
  APP.A.kopieren = function (el) {
    var v = el.dataset.v;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { APP.toast(v + ' kopiert.'); }, function () { APP.toast(v); });
  };
  APP.A['uva-melden'] = function (el) {
    var j = +el.dataset.j, m = +el.dataset.m, u = L.uva(D, j, m), aus = !!el.dataset.aus;
    var patch = aus ? { jahr: j, monat: m, uva_gemeldet_am: null, uva_zahllast: null } : { jahr: j, monat: m, uva_gemeldet_am: L.heute(), uva_zahllast: u.zahllast };
    APP.lauf(el, function () {
      return (L.monat(D, j, m) ? APP.upd('monate', { jahr: j, monat: m }, patch) : APP.ins('monate', [patch])).then(function () { APP.toast(aus ? 'Meldung zurückgenommen.' : 'UVA ' + L.MONATE[m] + ' als gemeldet gespeichert.'); APP.render(); });
    });
  };
  APP.A['uva-bezahlt'] = function (el) {
    var j = +el.dataset.j, m = +el.dataset.m, u = L.uva(D, j, m);
    APP.modal({
      title: 'UVA ' + L.MONATE[m] + ' bezahlt', body: '<p class="s" style="margin:0">Normalerweise erkennt die App die Zahlung im Kontoauszug („U ' + L.p2(m) + '/' + String(j).slice(2) + '“). Hier kannst du sie selbst eintragen.</p><div class="grid"><label class="f">Bezahlt am<input class="in" id="uz-d" value="' + L.datum(L.heute()) + '"></label><label class="f">Betrag €<input class="in" id="uz-b" inputmode="decimal" value="' + L.fmt(u.zahllast) + '"></label></div>',
      foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn pri" id="uz-ok">Speichern</button>'
    });
    document.getElementById('uz-ok').onclick = function () {
      var d = L.isoAus(document.getElementById('uz-d').value), b = L.parse(document.getElementById('uz-b').value);
      if (!d || !isFinite(b)) { APP.toast('Bitte Datum und Betrag prüfen.', { bad: true }); return; }
      var patch = { jahr: j, monat: m, uva_bezahlt_am: d, uva_bezahlt: L.r2(b) };
      (L.monat(D, j, m) ? APP.upd('monate', { jahr: j, monat: m }, patch) : APP.ins('monate', [patch])).then(function () { APP.schliessen(); APP.toast('Gespeichert.'); APP.render(); }).catch(APP.fehler);
    };
  };

  /* ---------- Steuern und Termine ---------- */
  APP.V.steuer = {
    titel: 'Steuern und Termine',
    render: function (arg) {
      var j = +(String(arg).match(/^\d{4}/) || [L.heute().slice(0, 4)])[0];
      var r = L.ruecklage(D), st = D.einst.steuer || {}, heute = L.heute();
      var termine = L.termine(D, j);
      var tRows = termine.map(function (t) {
        var d = L.tageBis(t.datum), status;
        if (t.offenNoch) status = '<span class="chip">Monat läuft</span>';
        else if (t.erledigt) status = '<span class="chip ok">' + (t.zahlung ? 'bezahlt ' + L.datumKurz(t.zahlung.datum) : 'erledigt') + '</span>';
        else if (t.betrag !== null && t.betrag <= 0) status = '<span class="chip blue">Gutschrift</span>';
        else status = d < 0 ? '<span class="chip bad">seit ' + (-d) + ' Tagen fällig</span>' : d <= 14 ? '<span class="chip warn">in ' + d + ' Tagen</span>' : '<span class="chip">offen</span>';
        return '<tr' + (t.art === 'uva' ? ' class="click" data-go="uva/' + t.jahr + '-' + t.monat + '"' : '') + '><td class="num">' + L.datum(t.datum) + '</td><td>' + h(t.titel) + '</td><td class="r num">' + (t.betrag === null ? '–' : L.fmt(t.betrag)) + '</td><td>' + status + '</td></tr>';
      }).join('');
      var v = L.vorschau(D, j), b = v.bisher, y = v.jahr;
      var zeile = function (k, a, c, fett) { return '<tr' + (fett ? ' class="sum"' : '') + '><td>' + k + '</td><td class="r num">' + L.fmt(a) + '</td><td class="r num">' + L.fmt(c) + '</td></tr>'; };
      var ergebnis = y.differenz < 0 ? 'Voraussichtlich <b>' + L.eurRund(-y.differenz) + ' zurück</b>' : 'Voraussichtlich <b>' + L.eurRund(y.differenz) + ' Nachzahlung</b>';
      return '<div class="top"><div><h1>Steuern und Termine</h1><div class="s">Steuernummer ' + h(st.stnr || '–') + ' · Abgabenkonto-Guthaben ' + L.eur(st.abgabenkonto_guthaben || 0) + (st.abgabenkonto_stand ? ' (Stand ' + L.datum(st.abgabenkonto_stand) + ')' : '') + '</div></div><div class="acts">' + APP.jahrWahl('steuer', j) + '<button type="button" class="btn" data-act="steuer-werte">Werte ändern</button></div></div>' +
        '<div class="tiles"><div class="tile"><span class="k">Kontostand ' + L.datum(r.kontostand.stand) + '</span><span class="v">' + L.eur(r.kontostand.betrag) + '</span><span class="u">laut N26-Auszug und Buchungen</span></div>' +
        '<div class="tile"><span class="k">Rücklage für Steuern</span><span class="v">' + L.eur(r.summe) + '</span><span class="u">' + r.posten.length + ' offene Posten in den nächsten Wochen</span></div>' +
        '<div class="tile dark"><span class="k">Frei verfügbar</span><span class="v">' + L.eur(r.frei) + '</span><span class="u">Kontostand minus Rücklage</span></div></div>' +
        '<div class="cols"><div class="wide"><div class="card flat"><div class="head"><h2>Rücklage</h2><span class="s">Stand ' + L.datum(heute) + '</span></div><div class="list">' +
        (r.posten.length ? r.posten.map(function (p) { return '<div class="item"><div class="grow"><span class="t">' + h(p.titel) + '</span><span class="s">fällig ' + L.datum(p.datum) + (p.hinweis ? ' · ' + h(p.hinweis) : '') + '</span></div><span class="amt">' + L.eur(p.betrag) + '</span></div>'; }).join('') : '<div class="empty">Nichts offen.</div>') + '</div></div>' +
        '<div class="card flat" style="margin-top:20px"><div class="head"><h2>Termine ' + j + '</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Datum</th><th>Was</th><th class="r">Betrag</th><th>Status</th></tr></thead><tbody>' + tRows + '</tbody></table></div></div></div>' +
        '<div class="narrow"><div class="card"><div class="head"><h2>Jahresvorschau ' + j + '</h2></div><div style="font-size:15px">' + ergebnis + ' bei der Einkommensteuer.</div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="r">bisher (' + v.monate + ' Mon.)</th><th class="r">aufs Jahr</th></tr></thead><tbody>' +
        zeile('Erlöse netto', b.erloese, y.erloese) + zeile('Ausgaben netto', -b.ausgaben, -y.ausgaben) + zeile('SVS-Beiträge', -b.svs, -y.svs) + (b.afa ? zeile('Abschreibung (grob)', -b.afa, -y.afa) : '') +
        zeile('Gewinn', b.gewinn, y.gewinn, true) + zeile('Grundfreibetrag 15 %', -b.gfb, -y.gfb) + (y.weitere ? zeile('Weitere Einkünfte', b.weitere, y.weitere) : '') + zeile('Einkommen', b.einkommen, y.einkommen, true) +
        zeile('Einkommensteuer', b.est, y.est) + zeile('Vorauszahlungen', -b.vz, -y.vz) + zeile('Differenz', b.differenz, y.differenz, true) + '</tbody></table></div>' +
        '<p class="s" style="margin:0">Schätzung mit dem Tarif ' + (L.TARIF[j] ? j : 'des letzten bekannten Jahres') + '. „Aufs Jahr“ rechnet den Monatsschnitt hoch. Ohne Taggelder, Privatanteile, Kürzungen bei Bewirtung und Abgrenzungen; das macht CNC.</p></div></div></div>';
    }
  };
  APP.A['steuer-werte'] = function () {
    var st = D.einst.steuer || {}, f = function (k, l, hint) { return '<label class="f">' + l + '<input class="in" name="' + k + '" value="' + h(st[k] === undefined || st[k] === null ? '' : (typeof st[k] === 'number' ? L.fmt(st[k]) : st[k])) + '">' + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</label>'; };
    APP.modal({
      title: 'Steuerwerte', body: '<div class="grid g2" id="sw">' + f('stnr', 'Steuernummer') + f('est_vz_jahr', 'ESt-Vorauszahlung im Jahr €', 'laut letztem Bescheid') + f('est_vz_quartal', 'davon je Quartal €') + f('svs_quartal', 'SVS-Beitrag je Quartal €') +
        f('abgabenkonto_guthaben', 'Guthaben am Abgabenkonto €') + '<label class="f">Stand des Abgabenkontos<input class="in" name="abgabenkonto_stand" value="' + h(L.datum(st.abgabenkonto_stand || '')) + '" placeholder="TT.MM.JJJJ"></label>' + f('weitere_einkuenfte', 'Weitere Einkünfte im Jahr €', 'z. B. Gehalt; für die Jahresvorschau') + '</div>',
      foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn pri" data-act="steuer-speichern">Speichern</button>'
    });
  };
  APP.A['steuer-speichern'] = function (el) {
    var v = APP.formDaten(document.getElementById('sw')), st = Object.assign({}, D.einst.steuer || {});
    ['est_vz_jahr', 'est_vz_quartal', 'svs_quartal', 'abgabenkonto_guthaben', 'weitere_einkuenfte'].forEach(function (k) { var n = L.parse(v[k]); st[k] = isFinite(n) ? n : 0; });
    st.stnr = v.stnr; st.abgabenkonto_stand = L.isoAus(v.abgabenkonto_stand) || st.abgabenkonto_stand;
    APP.lauf(el, function () { return APP.einstellung('steuer', st).then(function () { APP.schliessen(); APP.toast('Gespeichert.'); APP.render(); }); });
  };
})();
