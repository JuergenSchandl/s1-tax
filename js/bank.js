/* S1 Tax · Bankabgleich N26
   Kontoauszug (PDF oder CSV) einlesen, Buchungen automatisch den Belegen und
   Ausgangsrechnungen zuordnen, den Rest mit einem Klick klären. */
(function () {
  'use strict';
  var APP = window.APP, L = window.L, D = APP.D, S = APP.S, h = APP.h;
  var ART = { offen: ['offen', 'warn'], beleg: ['Beleg', 'ok'], ausgang: ['Zahlungseingang', 'ok'], einlage: ['Einlage', 'blue'], entnahme: ['Entnahme', 'blue'], cashback: ['Cashback', 'blue'], privat: ['privat', ''], unklar: ['unklar', 'warn'], differenz: ['Differenz', 'warn'] };

  function verknuepfung(b) {
    if (b.beleg_gruppe) {
      var g = L.gruppen(D.belege, function (x) { return x.gruppe === b.beleg_gruppe; })[0];
      if (g) return '<a href="#" data-act="beleg" data-g="' + g.gruppe + '">' + (L.belegNr(g) || 'neu') + ' · ' + h(g.lieferant) + '</a>' + (Math.abs(g.brutto + b.betrag) > 0.005 && !g.storniert ? ' <span class="chip warn">Beleg ' + L.fmt(g.brutto) + '</span>' : '') + (g.storniert ? ' <span class="chip bad">Beleg storniert</span>' : '');
    }
    if (b.ausgang_id) { var a = D.ausgang.find(function (x) { return x.id === b.ausgang_id; }); if (a) return 'Rechnung ' + h(a.nr) + ' · ' + h(a.kunde); }
    return h(b.notiz || '');
  }
  APP.V.bank = {
    titel: 'Bankabgleich',
    render: function (arg) {
      var x = APP.jm(arg), j = x.jahr, m = x.monat; S.jahr = j; S.monat = m;
      var nurOffen = String(arg).split('/')[1] === 'offen';
      var rows = D.bank.filter(function (b) { return b.jahr === j && b.monat === m; }).sort(function (a, b) { return a.datum.localeCompare(b.datum) || String(a.schluessel).localeCompare(String(b.schluessel)); });
      var alleOffen = D.bank.filter(function (b) { return b.art === 'offen'; });
      var offen = rows.filter(function (b) { return b.art === 'offen'; });
      var ein = rows.filter(function (b) { return b.betrag > 0; }).reduce(function (n, b) { return n + b.betrag; }, 0), aus = rows.filter(function (b) { return b.betrag < 0; }).reduce(function (n, b) { return n + b.betrag; }, 0);
      var k = L.kontostand(D);
      var liste = (nurOffen ? alleOffen : rows);
      var tabelle = liste.length ? '<div class="list">' + liste.map(function (b) {
        var a = ART[b.art] || [b.art, ''];
        return '<button type="button" class="item" data-act="bank-zeile" data-id="' + b.id + '"><div class="grow"><div style="display:flex;justify-content:space-between;gap:12px"><span class="t">' + h(b.name) + '</span><span class="amt ' + (b.betrag > 0 ? 'pos' : '') + '">' + L.eur(b.betrag, { plus: true }) + '</span></div>' +
          '<div class="s">' + L.datum(b.datum) + ' · ' + h(String(b.info || '').slice(0, 110)) + '</div><div style="font-size:13px">' + verknuepfung(b) + '</div></div><span class="chip ' + a[1] + '">' + a[0] + '</span></button>';
      }).join('') + '</div>' : '<div class="empty">' + (nurOffen ? 'Alles zugeordnet.' : 'Für ' + L.MONATE[m] + ' ' + j + ' ist noch kein Kontoauszug eingelesen.') + '</div>';
      return '<div class="top"><div><h1>Bankabgleich N26</h1><div class="s">Kontostand laut App: <b>' + L.eur(k.betrag) + '</b> am ' + L.datum(k.stand) + '</div></div><div class="acts">' + APP.jahrWahl('bank', j, '-' + m) +
        '<button type="button" class="btn pri" data-act="auszug-waehlen">' + APP.icon('upload', 16) + ' Kontoauszug einlesen</button></div></div>' +
        APP.monatsLeiste('bank', j, m, function (jj, mm) { return D.bank.some(function (b) { return b.jahr === jj && b.monat === mm && b.art === 'offen'; }) ? 'att' : D.bank.some(function (b) { return b.jahr === jj && b.monat === mm; }) ? 'ok' : ''; }) +
        '<div class="tiles"><div class="tile"><span class="k">Buchungen ' + L.MONATE[m] + '</span><span class="v">' + rows.length + '</span><span class="u">Eingang ' + L.eur(ein) + ' · Ausgang ' + L.eur(aus) + '</span></div>' +
        '<button type="button" class="tile" data-go="bank/' + j + '-' + m + (nurOffen ? '' : '/offen') + '"><span class="k">Noch offen</span><span class="v">' + offen.length + '</span><span class="u a">' + (nurOffen ? 'ganzen Monat zeigen' : alleOffen.length + ' in allen Monaten · anzeigen') + '</span></button>' +
        '<div class="tile"><span class="k">Zugeordnet</span><span class="v">' + (rows.length - offen.length) + '</span><span class="u">Belege, Rechnungen, Entnahmen</span></div></div>' +
        '<div class="drop" id="drop-auszug"><div class="ic">' + APP.icon('bank', 24) + '</div><div class="grow"><b>N26-Kontoauszug hier hineinziehen</b><div class="s">Das PDF aus der N26-App (Kontoauszug des Monats) oder der CSV-Export. Die App prüft die Summe gegen den Kontostand und ordnet automatisch zu.</div></div>' +
        (offen.length ? '<button type="button" class="btn" data-act="auto-abgleich" data-j="' + j + '" data-m="' + m + '">Automatisch zuordnen</button>' : '') + '</div>' +
        '<div class="card flat"><div class="head"><h2>' + (nurOffen ? 'Offene Buchungen (alle Monate)' : 'Buchungen ' + L.MONATE[m] + ' ' + j) + '</h2></div>' + tabelle + '</div>';
    },
    after: function () {
      var z = document.getElementById('drop-auszug'); if (!z) return;
      ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('over'); }); });
      z.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) einlesen(Array.prototype.slice.call(f)); });
    }
  };

  /* ---------- Kontoauszug einlesen ---------- */
  APP.A['auszug-waehlen'] = function () { var i = document.getElementById('f-auszug'); i.value = ''; i.click(); };
  document.addEventListener('change', function (e) { if (e.target.id === 'f-auszug' && e.target.files.length) einlesen(Array.prototype.slice.call(e.target.files)); });
  var pdfjs = null;
  function pdfLaden() {
    if (pdfjs) return Promise.resolve(pdfjs);
    return import(new URL('js/lib/pdf.min.mjs', document.baseURI).href).then(function (m) { m.GlobalWorkerOptions.workerSrc = new URL('js/lib/pdf.worker.min.mjs', document.baseURI).href; pdfjs = m; return m; });
  }
  APP.pdfLaden = pdfLaden;
  function pdfLesen(file) {
    return Promise.all([pdfLaden(), file.arrayBuffer()]).then(function (r) {
      return r[0].getDocument({ data: new Uint8Array(r[1]) }).promise;
    }).then(function (doc) {
      var pages = [], p = Promise.resolve();
      for (var i = 1; i <= doc.numPages; i++) (function (n) {
        p = p.then(function () { return doc.getPage(n); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          pages.push(window.N26.linesFromItems(tc.items.map(function (it) { return { str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }; })));
        });
      })(i);
      return p.then(function () { return window.N26.parseStatement(pages); });
    });
  }
  /* Text einer PDF (für andere Unterlagen, z. B. die KESt-Aufstellung der Bank) */
  APP.pdfText = function (file) {
    return Promise.all([pdfLaden(), file.arrayBuffer()]).then(function (r) {
      return r[0].getDocument({ data: new Uint8Array(r[1]) }).promise;
    }).then(function (doc) {
      var zeilen = [], p = Promise.resolve();
      for (var i = 1; i <= doc.numPages; i++) (function (n) {
        p = p.then(function () { return doc.getPage(n); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          zeilen = zeilen.concat(window.N26.linesFromItems(tc.items.map(function (it) { return { str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }; })));
        });
      })(i);
      return p.then(function () { return zeilen.join('\n'); });
    });
  };
  function einlesen(files) {
    var f = files[0];
    var istCsv = /csv/i.test(f.type) || /\.csv$/i.test(f.name);
    APP.modal({ title: 'Kontoauszug einlesen', body: '<p><span class="spin"></span> ' + h(f.name) + ' wird gelesen …</p>' });
    (istCsv ? f.text().then(function (t) { var r = window.N26.parseCsv(t); if (r.fehler) throw new Error(r.fehler); return r; }) : pdfLesen(f)).then(function (r) {
      if (!r.buchungen.length) throw new Error('In der Datei wurden keine Buchungen gefunden. Ist das der Kontoauszug von N26?');
      vorschau(r, istCsv ? null : f);
    }).catch(function (e) { APP.schliessen(); APP.fehler(e, 'Kontoauszug'); });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function vorschau(r, pdf) {
    /* schon vorhandene Buchungen erkennen (gleiches Datum, Betrag, Name) */
    var pool = D.bank.slice(), neu = [], dabei = 0;
    r.buchungen.forEach(function (t, i) {
      var k = pool.findIndex(function (b) { return b.datum === t.datum && Math.abs(b.betrag - t.betrag) < 0.005 && norm(b.name) === norm(t.name); });
      if (k >= 0) { pool.splice(k, 1); dabei++; } else neu.push(Object.assign({ i: i }, t));
    });
    var monate = {};
    neu.forEach(function (t) { var key = r.monat ? r.monat.jahr + '-' + r.monat.monat : t.datum.slice(0, 7); monate[key] = (monate[key] || 0) + 1; });
    var check = r.stimmt === true ? '<div class="note ok">Die Summe der ' + r.buchungen.length + ' Buchungen passt genau zum alten und neuen Kontostand (' + L.eur(r.zusammenfassung.alt) + ' → ' + L.eur(r.zusammenfassung.neu) + ').</div>'
      : r.stimmt === false ? '<div class="note bad">Achtung: Die Summe der gelesenen Buchungen passt nicht zum Kontostand im Auszug. Bitte den CSV-Export verwenden oder mir Bescheid geben.</div>'
        : '<div class="note">CSV-Export: ' + r.buchungen.length + ' Buchungen von ' + L.datum(r.buchungen[0].datum) + ' bis ' + L.datum(r.buchungen[r.buchungen.length - 1].datum) + '.</div>';
    var titel = r.monat ? 'Kontoauszug ' + L.MONATE[r.monat.monat] + ' ' + r.monat.jahr : 'N26-Buchungen';
    APP.modal({
      title: titel,
      body: check + '<div class="tiles"><div class="tile"><span class="k">Neu</span><span class="v">' + neu.length + '</span></div><div class="tile"><span class="k">Schon in der App</span><span class="v">' + dabei + '</span></div><div class="tile"><span class="k">Summe</span><span class="v">' + L.eur(r.summe) + '</span></div></div>' +
        (neu.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Datum</th><th>Name</th><th class="r">Betrag</th></tr></thead><tbody>' + neu.slice(0, 60).map(function (t) { return '<tr><td class="num">' + L.datumKurz(t.datum) + '</td><td>' + h(t.name) + '<div class="s">' + h(t.info.slice(0, 80)) + '</div></td><td class="r num">' + L.fmt(t.betrag) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p>Alle Buchungen sind schon in der App.</p>'),
      foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button>' + (neu.length && r.stimmt !== false ? '<button type="button" class="btn pri" id="auszug-ok">' + neu.length + ' Buchungen übernehmen</button>' : '')
    });
    var ok = document.getElementById('auszug-ok'); if (!ok) return;
    ok.onclick = function () {
      APP.lauf(ok, function () {
        var rows = neu.map(function (t) {
          var j = r.monat ? r.monat.jahr : +t.datum.slice(0, 4), m = r.monat ? r.monat.monat : +t.datum.slice(5, 7);
          var b = { jahr: j, monat: m, datum: t.datum, name: t.name, info: t.info, betrag: t.betrag, art: 'offen', auszug: 'N26 ' + L.p2(m) + '/' + j, schluessel: t.datum + '|' + t.betrag.toFixed(2) + '|' + t.name + '|' + (pdf ? t.i : 'csv' + t.i) };
          b.art = L.regelArt(b) || 'offen';
          if (b.art === 'entnahme') b.notiz = 'Entnahme Jürgen Schandl';
          return b;
        });
        return APP.ins('bank', rows, { upsert: 'schluessel', ignore: true }).then(function () {
          if (!pdf || !r.monat) return;
          var path = r.monat.jahr + '/kontoauszug/N26-' + r.monat.jahr + '-' + L.p2(r.monat.monat) + '-' + Date.now().toString(36) + '.pdf';
          return APP.hochladen('belege', path, pdf, 'application/pdf').then(function () {
            return APP.einstellung('auszuege', (D.einst.auszuege || []).concat([path]));
          }).catch(function (e) { APP.fehler(e, 'PDF des Auszugs'); });
        }).then(function () {
          var stand = r.zusammenfassung && r.zusammenfassung.neu;
          var st = D.einst.start || {};
          if (stand !== undefined && r.bis && (!st.kontostand_datum || r.bis > st.kontostand_datum)) {
            var k = L.kontostand(D);
            if (Math.abs(k.betrag - stand) > 0.005) APP.toast('Achtung: Kontostand laut Auszug ' + L.eur(stand) + ', laut App ' + L.eur(k.betrag) + '. Fehlt ein früherer Auszug?', { bad: true, ms: 9000 });
          }
          return abgleichAnwenden(r.monat ? r.monat.jahr : null, r.monat ? r.monat.monat : null);
        }).then(function (n) {
          APP.schliessen();
          APP.ok(rows.length + ' Buchungen übernommen, ' + n + ' automatisch zugeordnet.');
          if (r.monat) APP.go('bank/' + r.monat.jahr + '-' + r.monat.monat); else APP.render();
        });
      });
    };
  }

  /* ---------- Automatisch zuordnen ---------- */
  function abgleichAnwenden(j, m) {
    var liste = L.autoAbgleich(D, j, m), n = 0;
    return liste.reduce(function (p, x) {
      return p.then(function () {
        if (x.neuerBeleg) {
          var nb = x.neuerBeleg, gr = APP.uuid();
          return APP.ins('belege', [Object.assign({}, nb, { jahr: x.bank.jahr, monat: x.bank.monat, datum: x.bank.datum, gruppe: gr, zahlung: 'bank', quelle: 'manuell', status: 'geschaeftlich', bestaetigt: true, steuersatz: null })])
            .then(function () { n++; return APP.upd('bank', { id: x.bank.id }, { art: 'beleg', beleg_gruppe: gr }); });
        }
        return APP.upd('bank', { id: x.bank.id }, x.patch).then(function () {
          n++;
          if (x.ausgang) return APP.upd('ausgang', { id: x.ausgang.id }, { bezahlt_am: x.ausgang.bezahlt_am, bezahlt_betrag: x.ausgang.bezahlt_betrag });
        }).then(function () {
          if (x.monatNeu) return APP.upd('belege', { gruppe: x.monatNeu.gruppe }, { jahr: x.monatNeu.jahr, monat: x.monatNeu.monat });
        }).then(function () {
          if (x.karte) return APP.upd('belege', { gruppe: x.karte }, { zahlung: 'bank' });
        });
      });
    }, Promise.resolve()).then(function () { return n; });
  }
  APP.abgleichAnwenden = abgleichAnwenden;
  APP.A['auto-abgleich'] = function (el) {
    APP.lauf(el, function () { return abgleichAnwenden(+el.dataset.j, +el.dataset.m).then(function (n) { APP.toast(n ? n + ' Buchung(en) zugeordnet.' : 'Keine eindeutigen Treffer. Bitte die offenen Buchungen einzeln klären.', n ? { ok: true } : { warn: true }); APP.render(); }); });
  };

  /* ---------- eine Buchung klären ---------- */
  APP.A['bank-zeile'] = function (el) { bankDialog(D.bank.find(function (b) { return b.id === el.dataset.id; })); };
  function bankDialog(b) {
    if (!b) return;
    var kand = L.kandidaten(D, b, true).slice(0, 12);
    var wie = b.betrag < 0 ? (L.steuerBuchung(b) || L.wieLetztesMal(D, b)) : null;
    var zugeordnet = b.art !== 'offen';
    var body = '<div class="item" style="padding:0"><div class="grow"><span class="t">' + h(b.name) + '</span><span class="s">' + L.datum(b.datum) + ' · ' + h(b.info) + '</span></div><span class="amt ' + (b.betrag > 0 ? 'pos' : '') + '" style="font-size:18px">' + L.eur(b.betrag, { plus: true }) + '</span></div>';
    if (zugeordnet) body += '<div class="note ok">Zugeordnet: ' + (ART[b.art] || [b.art])[0] + ' · ' + verknuepfung(b) + '</div>';
    if (wie && !zugeordnet) {
      body += '<div class="card blue" style="padding:12px"><b>Vorschlag: so buchen wie zuletzt</b><div>' + h(wie.lieferant) + ' · ' + h(wie.text) + ' · Konto ' + h(wie.konto) + ' ' + h((window.KONTEN || {})[wie.konto] || '') + ' · ' + (wie.steuerart === 'vst' ? 'Vorsteuer ' + L.eur(wie.ust) : L.STEUERART[wie.steuerart]) + '</div>' +
        '<div class="chips"><button type="button" class="btn pri small" data-act="bank-wie" data-id="' + b.id + '">So buchen (Kontoauszug als Beleg)</button><button type="button" class="btn small" data-act="bank-neu-beleg" data-id="' + b.id + '">Vorher ändern</button></div></div>';
    }
    if (!zugeordnet || b.art === 'beleg' || b.art === 'ausgang') {
      body += '<h3>' + (b.betrag < 0 ? 'Passende Belege' : 'Offene Ausgangsrechnungen') + '</h3>' + (kand.length ? '<div class="list card flat" style="padding:0">' + kand.map(function (k) {
        if (k.art === 'beleg') return '<button type="button" class="item" data-act="bank-zu" data-id="' + b.id + '" data-g="' + k.g.gruppe + '"><div class="grow"><span class="t">' + h(k.g.lieferant || '(ohne Namen)') + '</span><span class="s">' + (L.belegNr(k.g) || 'neu') + ' · ' + L.MONATE[k.g.monat] + ' · ' + L.datum(k.g.datum) + ' · ' + h(k.g.text) + '</span></div><span class="amt">' + L.eur(k.g.brutto) + '</span>' + (k.gleich ? '<span class="chip ok">Betrag gleich</span>' : '') + (k.bar ? '<span class="chip yel">als bar erfasst, wird Karte</span>' : '') + '</button>';
        return '<button type="button" class="item" data-act="bank-zu" data-id="' + b.id + '" data-a="' + k.a.id + '"><div class="grow"><span class="t">Rechnung ' + h(k.a.nr) + ' · ' + h(k.a.kunde) + '</span><span class="s">vom ' + L.datum(k.a.datum) + (k.a.bezahlt_betrag !== null && !k.a.bezahlt_am ? ' · laut Liste bezahlt' : '') + '</span></div><span class="amt">' + L.eur(k.a.brutto) + '</span>' + (k.gleich ? '<span class="chip ok">Betrag gleich</span>' : '') + (k.nr ? '<span class="chip ok">Nummer im Text</span>' : '') + '</button>';
      }).join('') + '</div>' : '<div class="s">Kein passender Eintrag gefunden.</div>');
    }
    if (!zugeordnet && b.betrag < 0) body += '<div class="chips"><button type="button" class="btn" data-act="bank-upload" data-id="' + b.id + '">' + APP.icon('upload', 16) + ' Rechnung hochladen</button><button type="button" class="btn" data-act="bank-neu-beleg" data-id="' + b.id + '">Ohne Datei buchen</button></div>';
    var arten = b.betrag < 0 ? [['privat', 'Privat'], ['entnahme', 'Entnahme'], ['unklar', 'Unklar']] : [['einlage', 'Einlage'], ['cashback', 'Cashback / Zinsen'], ['privat', 'Privat'], ['unklar', 'Unklar']];
    body += '<h3>Oder</h3><div class="chips">' + arten.map(function (a) { return '<button type="button" class="btn small" data-act="bank-art" data-id="' + b.id + '" data-art="' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div>' +
      '<label class="f">Notiz<input class="in" id="bank-notiz" value="' + h(b.notiz || '') + '"></label>' + APP.fragenBlock('bank', [b.id]);
    APP.modal({
      title: 'Bankbuchung ' + L.datum(b.datum), body: body,
      foot: (zugeordnet ? '<div class="left"><button type="button" class="btn danger" data-act="bank-loesen" data-id="' + b.id + '">Zuordnung lösen</button></div>' : '') + '<button type="button" class="btn" data-act="bank-notiz" data-id="' + b.id + '">Notiz speichern</button><button type="button" class="btn pri" data-act="schliessen">Fertig</button>'
    });
  }
  APP.bankDialog = bankDialog;
  function nach(fn) { return function (el) { var b = D.bank.find(function (x) { return x.id === el.dataset.id; }); APP.lauf(el, function () { return fn(b, el); }).then(function () { APP.render(); }); }; }
  APP.A['bank-zu'] = nach(function (b, el) {
    if (el.dataset.g) {
      var g = L.gruppen(D.belege, function (x) { return x.gruppe === el.dataset.g; })[0];
      /* auch mehrere Abbuchungen für einen Beleg: stimmt die Summe, ist alles in Ordnung */
      var andere = D.bank.filter(function (x) { return x.beleg_gruppe === g.gruppe && x.id !== b.id; });
      var summe = L.r2(andere.concat([b]).reduce(function (n, x) { return n - L.n(x.betrag); }, 0));
      var passt = Math.abs(summe - g.brutto) < 0.005;
      return APP.upd('bank', { id: b.id }, { art: passt ? 'beleg' : 'differenz', beleg_gruppe: g.gruppe, ausgang_id: null, notiz: passt ? b.notiz : 'Konto ' + L.fmt(summe) + ' €, Beleg ' + L.fmt(g.brutto) + ' €' }).then(function () {
        if (passt) return Promise.all(andere.filter(function (x) { return x.art === 'differenz'; }).map(function (x) { return APP.upd('bank', { id: x.id }, { art: 'beleg', notiz: null }); }));
      }).then(function () {
        if (g.zahlung === 'bar') return APP.upd('belege', { gruppe: g.gruppe }, { zahlung: 'bank' });
      }).then(function () {
        if (!g.nr && (g.jahr !== b.jahr || g.monat !== b.monat)) return APP.upd('belege', { gruppe: g.gruppe }, { jahr: b.jahr, monat: b.monat }).then(function () { APP.toast('Beleg in den Monat der Zahlung verschoben (' + L.MONATE[b.monat] + ').'); });
      }).then(function () { APP.schliessen(); APP.ok('Zugeordnet.'); });
    }
    var a = D.ausgang.find(function (x) { return x.id === el.dataset.a; });
    return APP.upd('bank', { id: b.id }, { art: 'ausgang', ausgang_id: a.id, beleg_gruppe: null, notiz: 'Eingang Rg ' + a.nr + ' ' + a.kunde }).then(function () {
      return APP.upd('ausgang', { id: a.id }, { bezahlt_am: b.datum, bezahlt_betrag: b.betrag });
    }).then(function () { APP.schliessen(); APP.ok('Zahlung von ' + a.kunde + ' eingetragen.' + (Math.abs(a.brutto - b.betrag) > 0.005 ? ' Achtung: Betrag weicht ab (' + L.eur(a.brutto) + ').' : '')); });
  });
  APP.A['bank-art'] = nach(function (b, el) {
    var art = el.dataset.art, notiz = (document.getElementById('bank-notiz') || {}).value || null;
    if (art === 'entnahme' && !notiz) notiz = 'Entnahme Jürgen Schandl';
    if (art === 'einlage' && !notiz) notiz = 'Einlage Jürgen Schandl';
    return APP.upd('bank', { id: b.id }, { art: art, notiz: notiz }).then(function () { APP.schliessen(); APP.toast('Als ' + (ART[art] || [art])[0] + ' markiert.'); });
  });
  APP.A['bank-notiz'] = nach(function (b) { return APP.upd('bank', { id: b.id }, { notiz: document.getElementById('bank-notiz').value || null }).then(function () { APP.ok('Notiz gespeichert.'); }); });
  APP.A['bank-loesen'] = nach(function (b) {
    var job = Promise.resolve();
    if (b.ausgang_id) job = APP.upd('ausgang', { id: b.ausgang_id }, { bezahlt_am: null, bezahlt_betrag: null });
    return job.then(function () { return APP.upd('bank', { id: b.id }, { art: 'offen', beleg_gruppe: null, ausgang_id: null }); }).then(function () { APP.schliessen(); APP.toast('Zuordnung gelöst.'); });
  });
  APP.A['bank-wie'] = nach(function (b) {
    var w = L.steuerBuchung(b) || L.wieLetztesMal(D, b), gr = APP.uuid();
    return APP.ins('belege', [{ jahr: b.jahr, monat: b.monat, datum: b.datum, gruppe: gr, lieferant: w.lieferant, text: w.text, konto: w.konto, brutto: w.brutto, netto: w.netto, ust: w.ust, steuerart: w.steuerart, steuersatz: w.steuersatz || null, zahlung: 'bank', quelle: 'manuell', status: 'geschaeftlich', bestaetigt: true }])
      .then(function () { return APP.upd('bank', { id: b.id }, { art: 'beleg', beleg_gruppe: gr }); }).then(function () { APP.schliessen(); APP.ok('Gebucht: ' + w.text); });
  });
  APP.A['bank-neu-beleg'] = function (el) {
    var b = D.bank.find(function (x) { return x.id === el.dataset.id; }), w = L.steuerBuchung(b) || L.wieLetztesMal(D, b) || {};
    APP.belegDialog(null, { bank: b, vorgabe: { jahr: b.jahr, monat: b.monat, datum: b.datum, zahlung: 'bank', lieferant: w.lieferant || b.name, text: w.text || '', konto: w.konto || '', brutto: -b.betrag, netto: w.netto !== undefined ? w.netto : -b.betrag, ust: w.ust || 0, steuerart: w.steuerart || 'keine', steuersatz: w.steuersatz || 20 } });
  };
  APP.A['bank-upload'] = function (el) {
    var b = D.bank.find(function (x) { return x.id === el.dataset.id; });
    var i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf,image/*';
    i.onchange = function () {
      if (!i.files.length) return;
      APP.schliessen();
      APP.hochladenDateien([i.files[0]], { jahr: b.jahr, monat: b.monat, zahlung: 'bank', quelle: 'upload', bank: b }).then(function (l) {
        var u = l && l[0]; APP.render(); if (u && u.gruppe) APP.belegDialog(u.gruppe, { nachScan: true });
      });
    };
    i.click();
  };
})();
