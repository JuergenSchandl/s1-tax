/* S1 Tax · Übersicht, Abos, Anlagen, Suche, Jahrespaket, Rückfragen, Einstellungen, Anmeldung */
(function () {
  'use strict';
  var APP = window.APP, L = window.L, D = APP.D, S = APP.S, h = APP.h;

  /* ---------- Übersicht ---------- */
  function ziel(z) {
    var p = z.split(':'), first;
    if (p[0] === 'belege') {
      first = D.belege.filter(function (b) { return !b.storniert && (p[1] === 'neu' ? !b.bestaetigt : b.status === 'unklar'); }).sort(function (a, b) { return (a.jahr * 12 + a.monat) - (b.jahr * 12 + b.monat); })[0];
      return first ? 'monat/' + first.jahr + '-' + first.monat + '/' + p[1] : 'monat';
    }
    if (p[0] === 'bank') { first = D.bank.filter(function (b) { return b.art === 'offen'; })[0]; return first ? 'bank/' + first.jahr + '-' + first.monat + '/offen' : 'bank'; }
    if (p[0] === 'uva') return 'uva/' + p[1];
    if (p[0] === 'monat') return 'monat/' + p[1];
    if (p[0] === 'ausgang') return 'rechnung/' + p[1];
    return p[0];
  }
  APP.V.uebersicht = {
    titel: 'Übersicht',
    render: function () {
      var heute = L.heute(), j = +heute.slice(0, 4), m = +heute.slice(5, 7);
      var ar = D.ausgang.filter(function (a) { return a.jahr === j && L.ausgestellt(a); });
      var erl = ar.reduce(function (n, a) { return n + L.n(a.netto); }, 0);
      var aus = D.belege.filter(function (b) { return b.jahr === j && L.zaehlt(b) && Number(b.konto) >= 4000 && Number(b.konto) < 9000; }).reduce(function (n, b) { return n + L.n(b.netto); }, 0);
      var offen = D.ausgang.filter(L.offen), offenSum = offen.reduce(function (n, a) { return n + L.n(a.brutto); }, 0);
      var v = L.vorschau(D, j).jahr;
      var nx = null;
      for (var i = -3; i <= 0 && !nx; i++) { var x = L.monatPlus(j, m, i), u = L.uva(D, x.jahr, x.monat); if (!u.erledigt && i < 0) nx = { x: x, u: u }; }
      if (!nx) { var y = L.monatPlus(j, m, -1); nx = { x: y, u: L.uva(D, y.jahr, y.monat) }; }
      var hin = L.hinweise(D, APP.ich());
      var gruss = (new Date().getHours() < 11 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Hallo' : 'Guten Abend') + ', ' + h((S.me || {}).name || '');
      return '<div class="top"><div><h1>Übersicht ' + j + '</h1><div class="s">' + gruss + '. Stand ' + L.datum(heute) + (S.ausCache ? ' · ohne Netz, letzter Stand' : '') + '</div></div><div class="acts"><button type="button" class="btn" data-act="foto">' + APP.icon('kamera', 16) + ' Beleg fotografieren</button><button type="button" class="btn" data-act="dateien">' + APP.icon('upload', 16) + ' PDF hochladen</button></div></div>' +
        '<div class="tiles">' +
        '<button type="button" class="tile" data-go="ausgang"><span class="k">Erlöse netto</span><span class="v">' + L.eur(erl) + '</span><span class="u a">' + ar.length + ' Ausgangsrechnungen · anzeigen</span></button>' +
        '<button type="button" class="tile" data-go="monat"><span class="k">Ausgaben netto</span><span class="v">' + L.eur(aus) + '</span><span class="u">Konten 4000 bis 8999</span></button>' +
        '<button type="button" class="tile" data-go="ausgang"><span class="k">Offene Ausgangsrechnungen</span><span class="v">' + L.eur(offenSum) + '</span><span class="u a">' + offen.length + ' Rechnung(en) · anzeigen</span></button>' +
        '<button type="button" class="tile" data-go="steuer"><span class="k">Gewinn ' + j + ' · Schätzung</span><span class="v">ca. ' + L.eurRund(v.gewinn) + '</span><span class="u a">' + (v.differenz < 0 ? 'rund ' + L.eurRund(-v.differenz) + ' Steuer zurück' : 'rund ' + L.eurRund(v.differenz) + ' Nachzahlung') + ' · anzeigen</span></button>' +
        '<button type="button" class="tile dark" data-go="uva/' + nx.x.jahr + '-' + nx.x.monat + '"><span class="k">Nächste UVA · ' + L.MONATE[nx.x.monat] + '</span><span class="v">' + L.eur(nx.u.zahllast) + '</span><span class="u">fällig am ' + L.datum(nx.u.faellig) + (nx.u.gemeldet ? ' · gemeldet' : '') + '</span></button>' +
        '</div>' +
        '<div class="card flat"><div class="head"><h2>Zu erledigen</h2><span class="s">' + (hin.length ? hin.length + ' Punkte' : '') + '</span></div><div class="list">' +
        (hin.length ? hin.map(function (x) { return '<button type="button" class="item" data-go="' + h(ziel(x.ziel)) + '"><div class="grow"><span class="t">' + h(x.titel) + '</span><span class="s">' + h(x.text || '') + '</span></div>' + (x.prio === 0 ? '<span class="chip bad">dringend</span>' : '') + APP.icon('pfeil') + '</button>'; }).join('') : '<div class="empty">Alles erledigt.</div>') +
        '</div></div>' + (S.uploads && S.uploads.length ? '<div class="card"><div class="head"><h2>Zuletzt hochgeladen</h2></div>' + S.uploads.slice(0, 5).map(function (u) { return '<div class="row" style="display:flex;justify-content:space-between;gap:8px"><a href="#" data-act="beleg" data-g="' + (u.gruppe || '') + '">' + h(u.name) + '</a><span class="s">' + h(u.text || '') + '</span></div>'; }).join('') + '</div>' : '');
    }
  };

  /* ---------- Abos und Fixkosten ---------- */
  APP.V.abos = {
    titel: 'Abos und Fixkosten',
    render: function () {
      var aus = function (a) { var x = D.hinweise['abo:' + a.key]; return x && x.status === 'kein-abo'; };
      var list = L.abos(D), aktiv = list.filter(function (a) { return !a.beendet && !aus(a); }), weg = list.filter(function (a) { return a.beendet && !aus(a); }), versteckt = list.filter(aus);
      var jahr = D.einst.jahresabos || [];
      var monat = aktiv.reduce(function (n, a) { return n + a.ueblich; }, 0), jahrSum = jahr.reduce(function (n, a) { return n + L.n(a.betrag); }, 0);
      var zeile = function (a) {
        var hin = a.hinweise.filter(function (x) { return !(D.hinweise['abo-h:' + a.key + ':' + x.jahr + '-' + x.monat + ':' + x.art] || {}).status; });
        return '<div class="item"><div class="grow"><span class="t">' + h(a.name) + '</span><span class="s">' + a.anzahl + ' Abbuchungen in ' + a.monate + ' Monaten · zuletzt ' + L.datum(a.letzte.datum) + ' ' + L.eur(-a.letzte.betrag) + '</span>' +
          (hin.length ? '<div class="chips" style="margin-top:4px">' + hin.map(function (x) { return '<span class="chip ' + (x.art === 'doppelt' ? 'bad' : 'warn') + '">' + h(x.text) + ' <button type="button" class="btn small ghost" style="min-height:20px;padding:0 4px" data-act="abo-ok" data-k="abo-h:' + a.key + ':' + x.jahr + '-' + x.monat + ':' + x.art + '" title="passt so">✓</button></span>'; }).join('') + '</div>' : '') +
          '</div><span class="amt">' + L.eur(a.ueblich) + '<span class="s"> /Monat</span></span><button type="button" class="btn small ghost" data-act="abo-weg" data-k="' + h(a.key) + '">kein Abo</button></div>';
      };
      return '<div class="top"><div><h1>Abos und Fixkosten</h1><div class="s">Aus den Abbuchungen erkannt: was jeden Monat abgeht, Preisänderungen, doppelte oder fehlende Abbuchungen.</div></div><div class="acts"><button type="button" class="btn" data-act="jahresabo">+ Jahresabo</button></div></div>' +
        '<div class="tiles"><div class="tile"><span class="k">Jeden Monat</span><span class="v">' + L.eur(monat) + '</span><span class="u">' + aktiv.length + ' Abbuchungen</span></div><div class="tile"><span class="k">Jahresabos</span><span class="v">' + L.eur(jahrSum) + '</span><span class="u">' + jahr.length + ' Abos, einmal im Jahr</span></div><div class="tile dark"><span class="k">Fixkosten im Jahr</span><span class="v">ca. ' + L.eurRund(monat * 12 + jahrSum) + '</span><span class="u">Monatliches × 12 plus Jahresabos</span></div></div>' +
        '<div class="card flat"><div class="head"><h2>Monatlich</h2></div><div class="list">' + (aktiv.length ? aktiv.map(zeile).join('') : '<div class="empty">Noch keine regelmäßigen Abbuchungen erkannt.</div>') + '</div></div>' +
        '<div class="card flat"><div class="head"><h2>Jahresabos</h2><span class="s">Erinnerung 30 Tage vor der Verlängerung</span></div><div class="list">' + (jahr.length ? jahr.map(function (a, i) {
          var t = a.verlaengerung ? L.tageBis(a.verlaengerung) : null;
          return '<button type="button" class="item" data-act="jahresabo" data-i="' + i + '"><div class="grow"><span class="t">' + h(a.name) + '</span><span class="s">' + (a.verlaengerung ? 'verlängert sich am ' + L.datum(a.verlaengerung) : 'Datum fehlt') + (a.notiz ? ' · ' + h(a.notiz) : '') + '</span></div>' + (t !== null && t >= 0 && t <= 30 ? '<span class="chip warn">in ' + t + ' Tagen</span>' : '') + '<span class="amt">' + L.eur(a.betrag) + '</span></button>';
        }).join('') : '<div class="empty">Jahresabos (z. B. Software, Domains, Mitgliedschaften) hier eintragen, dann erinnert die App rechtzeitig vor der Verlängerung.</div>') + '</div></div>' +
        (weg.length ? '<div class="card flat"><div class="head"><h2>Beendet</h2><span class="s">seit mehr als zwei Monaten keine Abbuchung</span></div><div class="list">' + weg.map(zeile).join('') + '</div></div>' : '') +
        (versteckt.length ? '<p class="s">Ausgeblendet: ' + versteckt.map(function (a) { return '<a href="#" data-act="abo-zeigen" data-k="' + h(a.key) + '">' + h(a.name) + '</a>'; }).join(', ') + '</p>' : '');
    }
  };
  function hinweisSetzen(key, status) { return APP.ins('hinweise', [{ key: key, status: status }], { upsert: 'key' }).then(function () { APP.render(); }).catch(APP.fehler); }
  APP.A['abo-weg'] = function (el) { hinweisSetzen('abo:' + el.dataset.k, 'kein-abo'); };
  APP.A['abo-ok'] = function (el) { hinweisSetzen(el.dataset.k, 'ok'); };
  APP.A['abo-zeigen'] = function (el) { APP.del('hinweise', { key: 'abo:' + el.dataset.k }).then(function () { delete D.hinweise['abo:' + el.dataset.k]; APP.render(); }).catch(APP.fehler); };
  APP.A.jahresabo = function (el) {
    var list = (D.einst.jahresabos || []).slice(), i = el.dataset.i !== undefined ? +el.dataset.i : -1, a = i >= 0 ? list[i] : { name: '', betrag: 0, verlaengerung: '', notiz: '' };
    APP.modal({
      title: i >= 0 ? a.name : 'Jahresabo eintragen', body: '<div class="grid g2" id="ja"><label class="f">Name<input class="in" name="name" value="' + h(a.name) + '" autofocus></label><label class="f">Betrag im Jahr €<input class="in" name="betrag" inputmode="decimal" value="' + L.fmt(a.betrag || 0) + '"></label><label class="f">Nächste Verlängerung<input class="in" name="verlaengerung" placeholder="TT.MM.JJJJ" value="' + h(L.datum(a.verlaengerung)) + '"></label><label class="f">Notiz<input class="in" name="notiz" value="' + h(a.notiz || '') + '"></label></div>',
      foot: (i >= 0 ? '<div class="left"><button type="button" class="btn danger" id="ja-weg">Entfernen</button></div>' : '') + '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn pri" id="ja-ok">Speichern</button>'
    });
    document.getElementById('ja-ok').onclick = function () {
      var v = APP.formDaten(document.getElementById('ja'));
      if (!v.name.trim()) return;
      var neu = { name: v.name.trim(), betrag: L.r2(L.parse(v.betrag) || 0), verlaengerung: L.isoAus(v.verlaengerung) || '', notiz: v.notiz };
      if (i >= 0) list[i] = neu; else list.push(neu);
      APP.einstellung('jahresabos', list).then(function () { APP.schliessen(); APP.render(); }).catch(APP.fehler);
    };
    var w = document.getElementById('ja-weg');
    if (w) w.onclick = function () { list.splice(i, 1); APP.einstellung('jahresabos', list).then(function () { APP.schliessen(); APP.render(); }).catch(APP.fehler); };
  };

  /* ---------- Anlagen und Garantie ---------- */
  APP.V.anlagen = {
    titel: 'Anlagen und Garantie',
    render: function () {
      var gr = L.gruppen(D.belege, function (b) { return !b.storniert; });
      var anl = gr.filter(function (g) { return g.anlage; }).sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); });
      var kand = gr.filter(function (g) { return !g.anlage && g.status !== 'privat' && g.netto > 1000 && (Number(g.konto) < 1000 || [5262, 7600, 7385, 7381].indexOf(Number(g.konto)) >= 0) && !(D.hinweise['anlage:' + g.gruppe] || {}).status; });
      var gar = gr.filter(function (g) { return g.garantie_bis; }).sort(function (a, b) { return a.garantie_bis.localeCompare(b.garantie_bis); });
      var item = function (g, extra) { return '<button type="button" class="item" data-act="beleg" data-g="' + g.gruppe + '"><div class="grow"><span class="t">' + h(g.lieferant) + ' · ' + h(g.text) + '</span><span class="s">' + (L.belegNr(g) || 'neu') + ' · ' + L.datum(g.datum) + ' · Konto ' + h(g.konto) + '</span></div>' + (extra || '') + '<span class="amt">' + L.eur(g.netto) + ' <span class="s">netto</span></span></button>'; };
      return '<div class="top"><div><h1>Anlagen und Garantie</h1><div class="s">Käufe über 1.000 € netto sind Anlagegüter: CNC schreibt sie über die Nutzungsdauer ab. Bis 1.000 € netto sind sie sofort absetzbar (geringwertig).</div></div></div>' +
        (kand.length ? '<div class="card warn"><h2>Bitte prüfen: Anlagegut?</h2>' + kand.map(function (g) { return '<div class="item" style="padding:8px 0"><div class="grow"><span class="t">' + h(g.lieferant) + ' · ' + h(g.text) + '</span><span class="s">' + L.datum(g.datum) + ' · ' + L.eur(g.netto) + ' netto · Konto ' + h(g.konto) + '</span></div><button type="button" class="btn small pri" data-act="anlage-ja" data-g="' + g.gruppe + '">Ist ein Anlagegut</button><button type="button" class="btn small" data-act="anlage-nein" data-g="' + g.gruppe + '">Nein</button></div>'; }).join('') + '</div>' : '') +
        '<div class="card flat"><div class="head"><h2>Anlagegüter</h2></div><div class="list">' + (anl.length ? anl.map(function (g) { return item(g); }).join('') : '<div class="empty">Keine.</div>') + '</div></div>' +
        '<div class="card flat"><div class="head"><h2>Garantie und Gewährleistung</h2><span class="s">Erinnerung 30 Tage vor dem Ende</span></div><div class="list">' + (gar.length ? gar.map(function (g) {
          var t = L.tageBis(g.garantie_bis);
          return item(g, t < 0 ? '<span class="chip">abgelaufen</span>' : t <= 60 ? '<span class="chip warn">bis ' + L.datum(g.garantie_bis) + '</span>' : '<span class="chip ok">bis ' + L.datum(g.garantie_bis) + '</span>');
        }).join('') : '<div class="empty">Garantie-Datum im Beleg eintragen (Feld „Garantie bis“), dann erinnert die App.</div>') + '</div></div>';
    }
  };
  APP.A['anlage-ja'] = function (el) {
    var rows = D.belege.filter(function (b) { return b.gruppe === el.dataset.g && !b.storniert; }), g = rows[0];
    var gb = g.garantie_bis || (g.datum ? (+g.datum.slice(0, 4) + 2) + g.datum.slice(4) : null);
    Promise.all(rows.map(function (b) { return APP.upd('belege', { id: b.id }, { anlage: true, garantie_bis: gb }); })).then(function () { APP.toast('Als Anlagegut markiert, Garantie bis ' + L.datum(gb) + '.'); APP.render(); }).catch(APP.fehler);
  };
  APP.A['anlage-nein'] = function (el) { hinweisSetzen('anlage:' + el.dataset.g, 'nein'); };

  /* ---------- Suche ---------- */
  APP.V.suche = {
    titel: 'Suche',
    render: function (arg) {
      var q = decodeURIComponent(arg || '').trim(); S.q = q;
      var form = '<form data-form="suche" style="display:flex;gap:8px"><input class="in" name="q" type="search" value="' + h(q) + '" placeholder="Lieferant, Betrag, Rechnungs- oder Belegnummer" autofocus><button class="btn pri">Suchen</button></form>';
      if (!q) return '<div class="top"><h1>Suche</h1></div>' + form;
      var n = L.parse(q), istBetrag = isFinite(n) && /^[\d.,−-]+$/.test(q);
      var ql = q.toLowerCase(), hat = function () { for (var i = 0; i < arguments.length; i++) if (String(arguments[i] || '').toLowerCase().indexOf(ql) >= 0) return true; return false; };
      var gr = L.gruppen(D.belege).filter(function (g) {
        if (istBetrag && (Math.abs(g.brutto - Math.abs(n)) < 0.005 || Math.abs(g.netto - Math.abs(n)) < 0.005)) return true;
        return hat(g.lieferant, g.text, g.notiz, g.rechnungsnr, L.belegNr(g), g.rows.map(function (b) { return b.volltext; }).join(' '), g.rows.map(function (b) { return b.konto; }).join(' '));
      }).sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); });
      var ar = D.ausgang.filter(function (a) { return (istBetrag && (Math.abs(a.brutto - Math.abs(n)) < 0.005 || Math.abs(a.netto - Math.abs(n)) < 0.005)) || hat(a.nr, a.kunde, a.notiz, a.zeitraum); });
      var bk = D.bank.filter(function (b) { return (istBetrag && Math.abs(Math.abs(b.betrag) - Math.abs(n)) < 0.005) || hat(b.name, b.info, b.notiz); }).sort(function (a, b) { return b.datum.localeCompare(a.datum); });
      return '<div class="top"><h1>Suche: „' + h(q) + '“</h1></div>' + form +
        '<div class="card flat"><div class="head"><h2>Belege · ' + gr.length + '</h2></div>' + APP.belegTabelle(gr.slice(0, 200), { monat: true, leer: 'Keine Belege gefunden.' }) + '</div>' +
        '<div class="card flat"><div class="head"><h2>Ausgangsrechnungen · ' + ar.length + '</h2></div><div class="list">' + (ar.length ? ar.slice(0, 100).map(function (a) { return '<button type="button" class="item" data-go="rechnung/' + a.id + '"><div class="grow"><span class="t">' + h(a.nr || 'Entwurf') + ' · ' + h(a.kunde) + '</span><span class="s">' + L.datum(a.datum) + '</span></div><span class="amt">' + L.eur(a.brutto) + '</span></button>'; }).join('') : '<div class="empty">Keine.</div>') + '</div></div>' +
        '<div class="card flat"><div class="head"><h2>Bankbuchungen · ' + bk.length + '</h2></div><div class="list">' + (bk.length ? bk.slice(0, 100).map(function (b) { return '<button type="button" class="item" data-act="bank-zeile" data-id="' + b.id + '"><div class="grow"><span class="t">' + h(b.name) + '</span><span class="s">' + L.datum(b.datum) + ' · ' + h(String(b.info).slice(0, 90)) + '</span></div><span class="amt">' + L.eur(b.betrag) + '</span></button>'; }).join('') : '<div class="empty">Keine.</div>') + '</div></div>';
    }
  };

  /* ---------- Jahrespaket für CNC ---------- */
  APP.V.paket = {
    titel: 'Jahrespaket',
    render: function (arg) {
      var j = +(String(arg).match(/^\d{4}/) || [L.heute().slice(0, 4) - (+L.heute().slice(5, 7) < 3 ? 1 : 0)])[0];
      var rows = '';
      for (var m = 1; m <= 12; m++) {
        var mo = L.monat(D, j, m), gr = L.gruppen(D.belege, function (b) { return b.jahr === j && b.monat === m && L.zaehlt(b); });
        var dat = gr.filter(function (g) { return g.datei; }).length, unk = gr.filter(function (g) { return g.status === 'unklar'; }).length;
        rows += '<tr class="click" data-go="monat/' + j + '-' + m + '"><td>' + L.MONATE[m] + '</td><td class="r num">' + gr.length + '</td><td class="r num hm">' + dat + '</td><td>' + (mo && mo.abgeschlossen_am ? '<span class="chip blue">abgeschlossen</span>' : gr.length ? '<span class="chip">offen</span>' : '') + '</td><td>' + (mo && mo.geprueft_am ? '<span class="chip ' + (mo.nach_pruefung_geaendert ? 'warn' : 'ok') + '">geprüft</span>' : '') + '</td><td>' + (unk ? '<span class="chip warn">' + unk + ' unklar</span>' : '') + '</td></tr>';
      }
      return '<div class="top"><div><h1>Jahrespaket ' + j + ' für CNC</h1><div class="s">Alles, was CNC für den Jahresabschluss braucht, in einer ZIP-Datei: 12 Monats-Excel im bisherigen Format, alle Belege, Kontoauszüge, Rechnungsnummern und die Frageliste.</div></div><div class="acts">' + APP.jahrWahl('paket', j) + '</div></div>' +
        '<div class="card"><div class="chips"><button type="button" class="btn pri" data-act="paket" data-j="' + j + '" data-was="alles">Alles als ZIP</button><button type="button" class="btn" data-act="paket" data-j="' + j + '" data-was="excel">Nur die 12 Excel-Dateien</button><button type="button" class="btn" data-act="paket" data-j="' + j + '" data-was="fragen">Frageliste</button><button type="button" class="btn" data-act="rn-excel">Rechnungsnummern.xlsx</button></div><div id="paket-stand" class="s"></div></div>' +
        '<div class="card flat"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Monat</th><th class="r">Belege</th><th class="r hm">mit Datei</th><th>Abschluss</th><th>Prüfung</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }
  };
  APP.A.paket = function (el) {
    var j = +el.dataset.j, was = el.dataset.was, stand = function (t) { var s = document.getElementById('paket-stand'); if (s) s.textContent = t; };
    APP.lauf(el, function () {
      if (was === 'fragen') return window.XLSXW.build(L.fragenExcel(D, j)).then(function (b) { APP.speichernUnter(b, 'Fragen-' + j + '.xlsx'); });
      var zip = new window.JSZip(), p = Promise.resolve();
      for (var m = 1; m <= 12; m++) (function (m) {
        p = p.then(function () { return window.XLSXW.build(L.monatsExcel(D, j, m), 'uint8array'); }).then(function (b) { zip.file('Excel/' + L.monatsDatei(j, m), b); });
      })(m);
      if (was === 'alles') {
        p = p.then(function () { return window.XLSXW.build(L.rechnungsnummernExcel(D), 'uint8array'); }).then(function (b) { zip.file('Rechnungsnummern.xlsx', b); })
          .then(function () { return window.XLSXW.build(L.fragenExcel(D, j), 'uint8array'); }).then(function (b) { zip.file('Fragen-' + j + '.xlsx', b); });
        var gr = L.gruppen(D.belege, function (b) { return b.jahr === j && !!b.datei && L.zaehlt(b); });
        var ar = D.ausgang.filter(function (a) { return a.jahr === j && a.datei; });
        var az = (D.einst.auszuege || []).filter(function (x) { return x.indexOf(j + '/') === 0; });
        var n = 0, total = gr.length + ar.length + az.length;
        gr.forEach(function (g) { p = p.then(function () { stand('Belege: ' + (++n) + ' von ' + total); return APP.herunterladen('belege', g.datei); }).then(function (b) { zip.file('Belege/' + L.p2(g.monat) + '/' + L.dateiname(g), b); }); });
        ar.forEach(function (a) { p = p.then(function () { stand('Dateien: ' + (++n) + ' von ' + total); return APP.herunterladen('rechnungen', a.datei); }).then(function (b) { zip.file('Ausgangsrechnungen/Re_' + String(a.nr).replace('/', '-') + '_' + a.kunde.replace(/[^\wÄÖÜäöüß.-]+/g, '-') + '.pdf', b); }); });
        az.forEach(function (x) { p = p.then(function () { stand('Dateien: ' + (++n) + ' von ' + total); return APP.herunterladen('belege', x); }).then(function (b) { zip.file('Kontoauszuege/' + x.split('/').pop(), b); }); });
      }
      return p.then(function () { stand('ZIP wird gepackt …'); return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }); }).then(function (b) {
        stand(''); APP.speichernUnter(b, 'S1-Secure_' + (was === 'excel' ? 'Excel_' : 'Jahrespaket_') + j + '.zip');
      });
    });
  };

  /* ---------- Rückfragen ---------- */
  function bezug(f) {
    if (f.tabelle === 'belege') { var b = D.belege.find(function (x) { return x.id === f.datensatz; }); return b ? { text: 'Beleg ' + (L.belegNr(b) || 'neu') + ' · ' + b.lieferant + ' · ' + L.eur(b.brutto), act: 'data-act="beleg" data-g="' + b.gruppe + '"' } : null; }
    if (f.tabelle === 'bank') { var k = D.bank.find(function (x) { return x.id === f.datensatz; }); return k ? { text: 'Bank ' + L.datum(k.datum) + ' · ' + k.name + ' · ' + L.eur(k.betrag), act: 'data-act="bank-zeile" data-id="' + k.id + '"' } : null; }
    if (f.tabelle === 'ausgang') { var a = D.ausgang.find(function (x) { return x.id === f.datensatz; }); return a ? { text: 'Rechnung ' + a.nr + ' · ' + a.kunde, act: 'data-go="rechnung/' + a.id + '"' } : null; }
    return null;
  }
  APP.V.fragen = {
    titel: 'Rückfragen',
    render: function () {
      var ich = APP.ich();
      var offen = D.fragen.filter(function (f) { return !f.erledigt; }).sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
      var fertig = D.fragen.filter(function (f) { return f.erledigt; }).sort(function (a, b) { return b.updated_at.localeCompare(a.updated_at); }).slice(0, 30);
      var karte = function (f) {
        var bz = bezug(f);
        return '<div class="item"><div class="grow"><span class="s">' + APP.name(f.von) + ' an ' + APP.name(f.an || (f.von === 'j' ? 'd' : 'j')) + ' · ' + L.datum(f.created_at.slice(0, 10)) + '</span><span class="t" style="font-weight:500">' + h(f.text) + '</span>' +
          (bz ? '<a href="#" ' + bz.act + '>' + h(bz.text) + '</a>' : '') + (f.antwort ? '<span class="s">Antwort ' + APP.name(f.antwort_von) + ': <span style="color:var(--ink)">' + h(f.antwort) + '</span></span>' : '') + '</div>' +
          (!f.erledigt ? '<div class="chips">' + (!f.antwort && f.von !== ich ? '<button type="button" class="btn small pri" data-act="frage-antworten" data-id="' + f.id + '">Antworten</button>' : '') + '<button type="button" class="btn small" data-act="frage-erledigt" data-id="' + f.id + '">Erledigt</button></div>' : '') + '</div>';
      };
      return '<div class="top"><div><h1>Rückfragen</h1><div class="s">Fragen zwischen ' + APP.name('j') + ' und ' + APP.name('d') + '. Jede Frage hängt am Beleg, an der Bankbuchung oder Rechnung.</div></div><div class="acts"><button type="button" class="btn" data-act="frage-allgemein">Allgemeine Frage</button></div></div>' +
        '<div class="card flat"><div class="head"><h2>Offen · ' + offen.length + '</h2></div><div class="list">' + (offen.length ? offen.map(karte).join('') : '<div class="empty">Keine offenen Fragen.</div>') + '</div></div>' +
        (fertig.length ? '<div class="card flat"><div class="head"><h2>Erledigt</h2></div><div class="list">' + fertig.map(karte).join('') + '</div></div>' : '');
    }
  };
  APP.A['frage-allgemein'] = function () {
    APP.modal({ title: 'Frage an ' + (APP.ich() === 'j' ? APP.name('d') : APP.name('j')), body: '<label class="f">Frage<textarea class="in" id="fa" autofocus></textarea></label>', foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn pri" id="fa-ok">Fragen</button>' });
    document.getElementById('fa-ok').onclick = function () {
      var t = document.getElementById('fa').value.trim(); if (!t) return;
      APP.ins('fragen', [{ tabelle: 'allgemein', text: t, an: APP.ich() === 'j' ? 'd' : 'j' }]).then(function () { APP.schliessen(); APP.fn('erinnerungen', {}, 'jetzt').catch(function () {}); APP.render(); }).catch(APP.fehler);
    };
  };

  /* ---------- Einstellungen ---------- */
  var KI = { stand: null };
  APP.V.einstellungen = {
    titel: 'Einstellungen',
    render: function () {
      var f = D.einst.firma || {}, o = APP.ordner, ich = APP.ich();
      var ff = function (k, l, ph) { return '<label class="f">' + l + '<input class="in" name="' + k + '" value="' + h(f[k] || '') + '" placeholder="' + h(ph || '') + '"' + (ich !== 'j' ? ' disabled' : '') + '></label>'; };
      var sich = !APP.ordnerMoeglich() ? '<p class="s" style="margin:0">Die Sicherung in den OneDrive-Ordner geht am PC mit Chrome oder Edge. Am Handy ist sie nicht nötig: alle Daten liegen sicher in der Datenbank.</p>'
        : !o.handle ? '<p style="margin:0">Wähle einmal den Ordner <b>S1-SECURE › 01 Office › Buchhaltung S1</b> in deinem OneDrive. Die App legt dort alle Belege, Rechnungen, Kontoauszüge und Excel-Dateien ab; OneDrive sichert sie zusätzlich in der Cloud.</p><div><button type="button" class="btn pri" data-act="ordner-waehlen">Ordner wählen</button></div>'
          : '<p style="margin:0">Ordner: <b>' + h(o.handle.name) + '</b>' + (o.letzte ? ' · zuletzt gesichert ' + new Date(o.letzte.zeit).toLocaleString('de-AT') : '') + '</p><div class="chips"><button type="button" class="btn pri" data-act="sichern"' + (o.laeuft ? ' disabled' : '') + '>' + (o.laeuft ? '<span class="spin"></span> Sichert …' : 'Jetzt sichern') + '</button><button type="button" class="btn ghost" data-act="ordner-waehlen">Anderen Ordner wählen</button></div><p class="s" style="margin:0">Die App sichert bei jedem Öffnen am PC automatisch, wenn der Browser die Erlaubnis für den Ordner behalten hat.</p>';
      return '<div class="top"><h1>Einstellungen</h1></div>' +
        '<div class="cols"><div class="wide" style="display:flex;flex-direction:column;gap:20px">' +
        '<div class="card"><div class="head"><h2>Firma (für die Rechnungen)</h2></div><div class="grid g2" id="firma">' + ff('name', 'Firmenname') + ff('inhaber', 'Inhaber') + ff('strasse', 'Straße') + ff('ort', 'PLZ und Ort') + ff('tel', 'Telefon (Kopf)') + ff('tel_fuss', 'Telefon (Fußzeile)') + ff('mail', 'E-Mail') + ff('web', 'Webseite') + ff('fn', 'Firmenbuchnummer') + ff('uid', 'UID-Nummer') + ff('bank', 'Bank') + ff('iban', 'IBAN', 'AT.. oder DE..') + ff('bic', 'BIC') + '</div>' + (ich === 'j' ? '<div><button type="button" class="btn pri" data-act="firma-speichern">Speichern</button></div>' : '') + '</div>' +
        '<div class="card"><div class="head"><h2>Sicherung in OneDrive</h2></div>' + sich + '</div>' +
        '<div class="card"><div class="head"><h2>Automatisches Lesen der Belege</h2></div><div id="ki-stand">' + kiStand() + '</div></div>' +
        '<div class="card flat"><div class="head"><h2>Änderungsprotokoll</h2><button type="button" class="btn small" data-act="protokoll-laden">Laden</button></div><div id="protokoll"><div class="empty">Jede Änderung wird mit Datum und Namen gespeichert.</div></div></div>' +
        '</div><div class="narrow" style="display:flex;flex-direction:column;gap:20px">' +
        '<div class="card"><div class="head"><h2>Anmeldung</h2></div><p style="margin:0">Angemeldet als <b>' + h((S.me || {}).name) + '</b> (' + h((S.me || {}).email || '') + ')' + ((S.me || {}).rolle === 'kontrolle' ? ', Kontrolle' : '') + '.</p><div id="passkeys">' + (APP.passkeyMoeglich() ? '<button type="button" class="btn small" data-act="passkeys-laden">Passkeys anzeigen</button>' : '<span class="s">Passkeys gehen in diesem Browser nicht.</span>') + '</div>' +
        (APP.passkeyMoeglich() ? '<div><button type="button" class="btn pri" data-act="passkey-neu">Fingerabdruck / Face ID einrichten</button></div><p class="s" style="margin:0">Gilt für dieses Gerät. Jedes Handy und jeder PC wird einmal eingerichtet.</p>' : '') +
        '<div class="chips"><button type="button" class="btn small" data-act="passwort">Passwort ändern</button><button type="button" class="btn small" data-act="abmelden">Abmelden</button></div></div>' +
        APP.pushBereich() +
        '<div class="card"><h2>Über die App</h2><p class="s" style="margin:0">S1 Tax · Version ' + APP.VERSION + '<br>Daten in Supabase (EU, Frankfurt), nur für Jürgen und Dagmar zugänglich.<br>Daten geladen: ' + (S.stand ? new Date(S.stand).toLocaleString('de-AT') : '–') + '</p><div><button type="button" class="btn small" data-act="neu-laden">Daten neu laden</button></div></div>' +
        '</div></div>';
    },
    after: function () { if (!KI.stand) kiPruefen(); }
  };
  function kiStand() {
    if (!KI.stand) return '<span class="mut"><span class="spin"></span> wird geprüft …</span>';
    if (KI.stand.ok) return '<p style="margin:0"><span class="chip ok">Eingerichtet</span> Die App liest neue Belege mit Claude (' + h(KI.stand.modell || '') + ') und ordnet Konto und Steuer selbst zu.</p>';
    return '<div class="note warn">' + h(KI.stand.text) + '</div><p class="s" style="margin:0">Einrichten: In Supabase unter Edge Functions → Secrets einen Eintrag <b>ANTHROPIC_API_KEY</b> anlegen und dort den API-Schlüssel von console.anthropic.com einfügen. Danach diese Seite neu laden.</p>';
  }
  function kiPruefen() {
    APP.fn('beleg-lesen', { ping: true }).then(function (r) { KI.stand = { ok: !!r.ok, modell: r.modell, text: r.text || '' }; }, function (e) { KI.stand = { ok: false, text: e.status === 404 ? 'Der Lesedienst ist noch nicht installiert.' : (e.message || 'nicht erreichbar') }; })
      .then(function () { var b = document.getElementById('ki-stand'); if (b) b.innerHTML = kiStand(); });
  }
  APP.A['firma-speichern'] = function (el) {
    var v = APP.formDaten(document.getElementById('firma')), f = Object.assign({}, D.einst.firma || {}, v);
    f.iban = String(f.iban || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
    if (f.iban && !/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,32}$/.test(f.iban)) { APP.toast('Die IBAN sieht nicht richtig aus.', { bad: true }); return; }
    APP.lauf(el, function () { return APP.einstellung('firma', f).then(function () { APP.toast('Gespeichert.'); APP.render(); }); });
  };
  APP.A['ordner-waehlen'] = function () { APP.ordnerWaehlen().then(function () { APP.toast('Ordner gewählt. Die erste Sicherung läuft …'); return APP.sichern(false); }).catch(function (e) { if (e && e.name !== 'AbortError') APP.fehler(e, 'Ordner'); }); };
  APP.A.sichern = function () { APP.sichern(false); };
  APP.A['neu-laden'] = function (el) { APP.lauf(el, function () { return APP.laden().then(function () { APP.toast('Neu geladen.'); APP.render(); }); }); };
  APP.A['protokoll-laden'] = function (el) {
    APP.lauf(el, function () {
      return APP.sb.from('protokoll').select('*').order('zeit', { ascending: false }).limit(150).then(function (r) {
        if (r.error) throw r.error;
        var tab = { belege: 'Beleg', bank: 'Bank', ausgang: 'Rechnung', kunden: 'Kunde', monate: 'Monat', einstellungen: 'Einstellung', fragen: 'Frage', hinweise: 'Hinweis' };
        var aus = function (x) {
          if (x.aktion !== 'update' || !x.alt || !x.neu) return x.aktion === 'insert' ? 'neu' : x.aktion;
          return Object.keys(x.neu).filter(function (k) { return ['updated_at', 'updated_by', 'lesung', 'volltext'].indexOf(k) < 0 && JSON.stringify(x.neu[k]) !== JSON.stringify(x.alt[k]); }).map(function (k) {
            var a = x.alt[k], n = x.neu[k], s = function (v) { return v === null || v === undefined ? '–' : typeof v === 'object' ? '…' : String(v).slice(0, 40); };
            return k + ': ' + s(a) + ' → ' + s(n);
          }).join(', ') || 'gespeichert';
        };
        var name = function (x) { var n = x.neu || x.alt || {}; return n.lieferant || n.name || n.kunde || n.kurz || n.key || (n.jahr && n.monat ? L.MONATE[n.monat] + ' ' + n.jahr : '') || ''; };
        document.getElementById('protokoll').innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Zeit</th><th>Wer</th><th>Was</th><th>Änderung</th></tr></thead><tbody>' + (r.data || []).map(function (x) {
          return '<tr><td class="num">' + new Date(x.zeit).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' }) + '</td><td>' + h(APP.name(x.person) || 'System') + '</td><td>' + h((tab[x.tabelle] || x.tabelle) + ' ' + name(x)) + '</td><td class="s">' + h(aus(x)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      });
    });
  };
  APP.A['passkeys-laden'] = function (el) {
    APP.lauf(el, function () {
      return APP.sb.auth.passkey.list().then(function (r) {
        if (r.error) throw r.error;
        var l = r.data || [];
        document.getElementById('passkeys').innerHTML = l.length ? l.map(function (p) { return '<div class="item" style="padding:6px 0"><div class="grow"><span>' + h(p.friendly_name || 'Passkey') + '</span><span class="s">eingerichtet ' + L.datum((p.created_at || '').slice(0, 10)) + (p.last_used_at ? ' · zuletzt ' + L.datum(p.last_used_at.slice(0, 10)) : '') + '</span></div><button type="button" class="btn small ghost" data-act="passkey-weg" data-id="' + h(p.id) + '">Entfernen</button></div>'; }).join('') : '<span class="s">Noch kein Passkey eingerichtet.</span>';
      });
    }).catch(function (e) { APP.toast(APP.passkeyFehler(e), { bad: true }); });
  };
  APP.A['passkey-neu'] = function (el) {
    APP.lauf(el, function () {
      return APP.sb.auth.registerPasskey().then(function (r) {
        if (r.error) throw r.error;
        try { localStorage.setItem('s1tax:passkey', '1'); } catch (e) { /* egal */ }
        APP.toast('Eingerichtet. Ab jetzt kannst du dich auf diesem Gerät mit Fingerabdruck oder Gesicht anmelden.');
      });
    }).catch(function (e) { APP.toast(APP.passkeyFehler(e), { bad: true }); });
  };
  APP.A['passkey-weg'] = function (el) {
    APP.sb.auth.passkey.delete({ passkeyId: el.dataset.id }).then(function (r) { if (r.error) throw r.error; APP.toast('Entfernt.'); APP.A['passkeys-laden'](document.querySelector('[data-act="passkeys-laden"]') || document.createElement('button')); }).catch(function (e) { APP.toast(APP.passkeyFehler(e), { bad: true }); });
  };
  APP.A.passwort = function () {
    APP.modal({ title: 'Passwort ändern', body: '<label class="f">Neues Passwort (mindestens 10 Zeichen)<input class="in" type="password" id="pw1" autocomplete="new-password" autofocus></label><label class="f">Wiederholen<input class="in" type="password" id="pw2" autocomplete="new-password"></label>', foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn pri" id="pw-ok">Ändern</button>' });
    document.getElementById('pw-ok').onclick = function () {
      var a = document.getElementById('pw1').value, b = document.getElementById('pw2').value;
      if (a.length < 10) { APP.toast('Bitte mindestens 10 Zeichen.', { bad: true }); return; }
      if (a !== b) { APP.toast('Die beiden Eingaben sind verschieden.', { bad: true }); return; }
      APP.sb.auth.updateUser({ password: a }).then(function (r) { if (r.error) throw r.error; APP.schliessen(); APP.toast('Passwort geändert.'); }).catch(APP.fehler);
    };
  };

  /* ---------- Anmeldung ---------- */
  APP.V.login = {
    render: function () {
      var pk = APP.passkeyMoeglich();
      return '<div class="login"><div class="card"><div class="brand"><div class="logo">S1</div><div><b>S1 Tax</b><span class="s">Buchhaltung S1 Secure e.U.</span></div></div>' +
        (S.loginFehler ? '<div class="note bad">' + h(S.loginFehler) + '</div>' : '') +
        (pk ? '<button type="button" class="btn pri" data-act="login-passkey" style="min-height:48px">Mit Fingerabdruck, Face ID oder Windows Hello</button><div class="s" style="text-align:center">oder mit E-Mail und Passwort</div>' : '') +
        '<form data-form="login" style="display:flex;flex-direction:column;gap:12px"><label class="f">E-Mail<input class="in" name="email" type="email" autocomplete="username" required></label><label class="f">Passwort<input class="in" name="pw" type="password" autocomplete="current-password" required></label><button class="btn' + (pk ? '' : ' pri') + '" style="min-height:46px">Anmelden</button></form></div></div>';
    }
  };
  APP.A['form-login'] = function (f) {
    var b = f.querySelector('button');
    S.loginFehler = '';
    APP.lauf(b, function () {
      return APP.sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.pw.value }).then(function (r) {
        if (r.error) { S.loginFehler = /invalid/i.test(r.error.message) ? 'E-Mail oder Passwort stimmt nicht.' : r.error.message; APP.render(); return; }
        return APP.nachAnmeldung();
      });
    });
  };
  APP.A['login-passkey'] = function (el) {
    S.loginFehler = '';
    APP.lauf(el, function () {
      return APP.sb.auth.signInWithPasskey().then(function (r) {
        if (r.error) { S.loginFehler = APP.passkeyFehler(r.error); APP.render(); return; }
        return APP.nachAnmeldung();
      });
    }).catch(function (e) { S.loginFehler = APP.passkeyFehler(e); APP.render(); });
  };
  APP.A.abmelden = function () {
    APP.schliessen();
    APP.pushAus(true).then(function () { return APP.sb.auth.signOut(); }).then(function () {
      S.me = null; try { localStorage.removeItem('s1tax:cache'); } catch (e) { /* egal */ }
      Object.assign(D, { belege: [], bank: [], ausgang: [], kunden: [], monate: [], einst: {}, fragen: [], hinweise: {}, members: [] });
      location.hash = ''; APP.render();
    });
  };
})();
