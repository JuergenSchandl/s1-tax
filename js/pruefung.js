/* S1 Tax · Gegenprobe ohne KI
   Liest im Gerät den Text einer PDF und eine eingebettete E-Rechnung (ZUGFeRD/Factur-X/XRechnung)
   und prüft damit die gelesenen Werte. Ergebnis steht in lesung.pruefung jeder Zeile. */
(function () {
  'use strict';
  var APP = window.APP, L = window.L, D = APP.D;

  APP.pdfDokument = function (blob) {
    return Promise.all([APP.pdfLaden(), blob.arrayBuffer()]).then(function (r) {
      return r[0].getDocument({ data: new Uint8Array(r[1]) }).promise;
    }).then(function (doc) {
      var teile = [], p = Promise.resolve(), n = Math.min(doc.numPages, 30);
      for (var i = 1; i <= n; i++) (function (k) {
        p = p.then(function () { return doc.getPage(k); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          teile.push(tc.items.map(function (it) { return (it.str || '') + (it.hasEOL ? '\n' : ' '); }).join(''));
        });
      })(i);
      return p.then(function () { return doc.getAttachments().catch(function () { return null; }); }).then(function (anh) {
        /* pdf.js 6 liefert eine Map ohne Inhalt; den Inhalt gibt es über getAttachmentContent */
        var liste = !anh ? [] : (anh instanceof Map ? Array.from(anh.entries()) : Object.keys(anh).map(function (k) { return [k, anh[k]]; }));
        var x = liste.filter(function (e) { return /\.xml$/i.test(String((e[1] && e[1].filename) || e[0])); })[0];
        if (!x) return null;
        return (x[1] && x[1].content ? Promise.resolve(x[1].content) : doc.getAttachmentContent ? doc.getAttachmentContent(x[0]) : Promise.resolve(null)).catch(function () { return null; });
      }).then(function (inhalt) {
        var xml = null;
        if (inhalt) { try { xml = new TextDecoder('utf-8').decode(inhalt); } catch (e) { /* egal */ } }
        return { text: teile.join('\n'), xml: xml, seiten: doc.numPages };
      });
    });
  };
  APP.dokHolen = function (datei, blob) {
    if (!datei || !/\.pdf$/i.test(datei)) return Promise.resolve(null);
    return (blob ? Promise.resolve(blob) : APP.herunterladen('belege', datei)).then(APP.pdfDokument).catch(function (e) {
      if (window.console) console.warn('PDF lesen', e);
      return { fehler: APP.fehlerText(e) };
    });
  };
  APP.textlos = function (dok) { return !dok || dok.fehler || (!dok.xml && String(dok.text || '').replace(/\s/g, '').length < 20); };

  /* prüft eine Gruppe gegen ihr Dokument und speichert das Ergebnis (bei E-Rechnung auch die exakten Werte) */
  APP.belegPruefen = function (gruppe, dok) {
    var rows = D.belege.filter(function (b) { return b.gruppe === gruppe && !b.storniert; });
    var f = rows[0];
    if (!f || !f.datei || !/\.pdf$/i.test(f.datei)) return Promise.resolve(null);
    return (dok ? Promise.resolve(dok) : APP.dokHolen(f.datei)).then(function (d) {
      var g = L.gruppen(rows)[0], pr;
      if (!d || d.fehler) pr = { quelle: 'fehler', text: d && d.fehler || null, summe: g.brutto };
      else {
        var x = d.xml ? L.eRechnung(d.xml) : null;
        pr = x ? L.eRechnungVergleich(g, x) : L.textPruefung(g, d.text);
      }
      pr.am = new Date().toISOString();
      var korr = pr.korrektur || {};
      var speichern = Object.assign({}, pr); delete speichern.korrektur;
      return rows.reduce(function (p, b) {
        return p.then(function () {
          var patch = { lesung: Object.assign({}, b.lesung || {}, { pruefung: speichern }) };
          if (korr.datum) patch.datum = korr.datum;
          if (korr.rechnungsnr) patch.rechnungsnr = korr.rechnungsnr;
          if (korr.zeilen && korr.zeilen[b.id]) Object.assign(patch, korr.zeilen[b.id]);
          return APP.upd('belege', { id: b.id }, patch);
        });
      }, Promise.resolve()).then(function () { return pr; });
    });
  };

  /* Belege, die noch nicht gegen ihr Dokument geprüft sind (z. B. vor diesem Update gelesen): still nachholen */
  APP.nachpruefen = function (max) {
    if (!S().me || !navigator.onLine) return Promise.resolve(0);
    var offen = L.gruppen(D.belege, function (b) { return !b.storniert; }).filter(function (g) {
      var f = g.rows.filter(function (b) { return !b.storniert; })[0];
      return f && !g.bestaetigt && !g.nr && g.quelle !== 'import' && /\.pdf$/i.test(g.datei || '') && !(f.lesung && f.lesung.pruefung);
    }).slice(0, max || 10);
    var n = 0;
    return offen.reduce(function (p, g) {
      return p.then(function () { return APP.belegPruefen(g.gruppe).then(function () { n++; }); }).catch(function () { /* nächstes Mal */ });
    }, Promise.resolve()).then(function () { return n; });
  };
  function S() { return APP.S; }

  /* ---------- Excel-Datei lesen (Werte, Texte, Formeln) ---------- */
  APP.xlsxLesen = function (file) {
    return file.arrayBuffer().then(function (buf) { return window.JSZip.loadAsync(buf); }).then(function (zip) {
      var lies = function (n) { var f = zip.file(n); return f ? f.async('string') : Promise.resolve(''); };
      return Promise.all([lies('xl/workbook.xml'), lies('xl/_rels/workbook.xml.rels'), lies('xl/sharedStrings.xml')]).then(function (r) {
        var P = new DOMParser(), wb = P.parseFromString(r[0], 'application/xml'), rel = P.parseFromString(r[1] || '<x/>', 'application/xml'), ss = P.parseFromString(r[2] || '<x/>', 'application/xml');
        var strings = Array.prototype.map.call(ss.getElementsByTagNameNS('*', 'si'), function (si) { return Array.prototype.map.call(si.getElementsByTagNameNS('*', 't'), function (t) { return t.textContent; }).join(''); });
        var ziel = {}; Array.prototype.forEach.call(rel.getElementsByTagNameNS('*', 'Relationship'), function (x) { ziel[x.getAttribute('Id')] = x.getAttribute('Target'); });
        var blaetter = Array.prototype.map.call(wb.getElementsByTagNameNS('*', 'sheet'), function (sh) {
          var rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
          var t = String(ziel[rid] || '').replace(/^\//, '').replace(/^xl\//, '');
          return { name: sh.getAttribute('name'), pfad: 'xl/' + t };
        });
        return Promise.all(blaetter.map(function (b) {
          return lies(b.pfad).then(function (x) {
            var doc = P.parseFromString(x || '<x/>', 'application/xml'), rows = [];
            Array.prototype.forEach.call(doc.getElementsByTagNameNS('*', 'row'), function (row) {
              var ri = +row.getAttribute('r') - 1, arr = rows[ri] = [];
              Array.prototype.forEach.call(row.getElementsByTagNameNS('*', 'c'), function (c) {
                var ref = String(c.getAttribute('r') || ''), col = 0, m = ref.match(/^[A-Z]+/);
                if (m) for (var i = 0; i < m[0].length; i++) col = col * 26 + (m[0].charCodeAt(i) - 64);
                var typ = c.getAttribute('t'), v = c.getElementsByTagNameNS('*', 'v')[0], f = c.getElementsByTagNameNS('*', 'f')[0], is = c.getElementsByTagNameNS('*', 'is')[0];
                var wert = null;
                if (typ === 's' && v) wert = strings[+v.textContent];
                else if (typ === 'inlineStr' && is) wert = is.textContent;
                else if ((typ === 'str' || typ === 'e') && v) wert = v.textContent;
                else if (typ === 'b' && v) wert = v.textContent === '1';
                else if (v && v.textContent !== '') wert = Number(v.textContent);
                else if (f) wert = { f: '=' + f.textContent };
                arr[col - 1] = wert;
              });
            });
            for (var i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
            return { name: b.name, rows: rows };
          });
        }));
      });
    });
  };

  /* ---------- Monat mit einer Liste vergleichen (eigene Excel oder Liste der CNC) ---------- */
  APP.A['monat-vergleich'] = function (el) {
    var j = +el.dataset.j, m = +el.dataset.m, i = document.createElement('input');
    i.type = 'file'; i.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    i.onchange = function () {
      var f = i.files && i.files[0]; if (!f) return;
      APP.modal({ title: 'Mit Liste vergleichen', body: '<p><span class="spin"></span> ' + APP.h(f.name) + ' wird gelesen …</p>' });
      APP.xlsxLesen(f).then(function (bl) {
        var v = L.monatVergleich(D, j, m, bl);
        if (!v) throw new Error('In der Datei wurde keine Liste mit „Datum“ und „Brutto“ gefunden. Bitte die Monatsliste im bisherigen Format verwenden.');
        var kurz = function (x) { return { datum: x.datum, name: x.name, brutto: x.brutto, konto: x.konto, nr: x.nr || '' }; };
        var e = { am: new Date().toISOString(), von: APP.ich(), datei: f.name, app: v.zeilen.app, liste: v.zeilen.liste, gleich: v.ein.gleich.length,
          abweichend: v.ein.abweichend.slice(0, 60).map(function (x) { return { datum: x.app.datum, name: x.app.name, felder: x.felder }; }),
          nurApp: v.ein.nurApp.slice(0, 60).map(kurz), nurListe: v.ein.nurListe.slice(0, 60).map(kurz), summe: v.ein.summe,
          aus: v.aus ? { gleich: v.aus.gleich.length, abweichend: v.aus.abweichend.map(function (x) { return { nr: x.app.nr, felder: x.felder }; }), nurApp: v.aus.nurApp.map(function (x) { return x.nr; }), nurListe: v.aus.nurListe.map(function (x) { return x.nr; }) } : null };
        var alle = Object.assign({}, D.einst.vergleiche || {}); alle[j + '-' + m] = e;
        return APP.einstellung('vergleiche', alle).then(function () { APP.render(); APP.vergleichZeigen(j, m); });
      }).catch(function (e) { APP.schliessen(); APP.fehler(e, 'Vergleich'); });
    };
    i.click();
  };
  APP.vergleichText = function (e) {
    var probleme = e.abweichend.length + e.nurApp.length + e.nurListe.length + (e.aus ? e.aus.abweichend.length + e.aus.nurApp.length + e.aus.nurListe.length : 0);
    return { probleme: probleme, text: e.gleich + ' von ' + Math.max(e.app, e.liste) + ' Zeilen gleich' + (probleme ? ' · ' + probleme + ' ' + (probleme === 1 ? 'Unterschied' : 'Unterschiede') : ' · keine Unterschiede') };
  };
  APP.vergleichZeigen = function (j, m) {
    var e = (D.einst.vergleiche || {})[j + '-' + m]; if (!e) return;
    var h = APP.h, vt = APP.vergleichText(e);
    var tab = function (titel, kopf, zeilen) { return zeilen.length ? '<h3 style="margin:14px 0 6px">' + titel + '</h3><div class="tbl-wrap"><table class="tbl"><thead><tr>' + kopf.map(function (k) { return '<th>' + k + '</th>'; }).join('') + '</tr></thead><tbody>' + zeilen.join('') + '</tbody></table></div>' : ''; };
    var body = '<div class="note ' + (vt.probleme ? 'warn' : 'ok') + '"><b>' + h(vt.text) + '</b><br>Liste: ' + h(e.datei) + ' · App ' + L.eur(e.summe.app) + ' · Liste ' + L.eur(e.summe.liste) + (Math.abs(e.summe.app - e.summe.liste) > 0.01 ? ' · Differenz ' + L.eur(Math.abs(e.summe.app - e.summe.liste)) : '') + '</div>' +
      tab('Unterschiedlich', ['Datum', 'Name', 'App statt Liste'], e.abweichend.map(function (x) { return '<tr><td>' + L.datum(x.datum) + '</td><td>' + h(x.name) + '</td><td>' + h(x.felder.join(' · ')) + '</td></tr>'; })) +
      tab('Nur in der App', ['Datum', 'Name', 'Konto', 'Brutto'], e.nurApp.map(function (x) { return '<tr><td>' + L.datum(x.datum) + '</td><td>' + h(x.name) + '</td><td>' + h(x.konto || '') + '</td><td class="num">' + L.eur(x.brutto) + '</td></tr>'; })) +
      tab('Nur in der Liste', ['Datum', 'Name', 'Konto', 'Brutto'], e.nurListe.map(function (x) { return '<tr><td>' + L.datum(x.datum) + '</td><td>' + h(x.name) + '</td><td>' + h(x.konto || '') + '</td><td class="num">' + L.eur(x.brutto) + '</td></tr>'; })) +
      (e.aus && (e.aus.abweichend.length || e.aus.nurApp.length || e.aus.nurListe.length) ? '<h3 style="margin:14px 0 6px">Ausgangsrechnungen (App statt Liste)</h3><ul>' + e.aus.abweichend.map(function (x) { return '<li>' + h(x.nr) + ': ' + h(x.felder.join(' · ')) + '</li>'; }).join('') + e.aus.nurApp.map(function (n) { return '<li>' + h(n) + ' nur in der App</li>'; }).join('') + e.aus.nurListe.map(function (n) { return '<li>' + h(n) + ' nur in der Liste</li>'; }).join('') + '</ul>' : '') +
      '<p class="mut" style="margin-top:12px">Verglichen am ' + L.datum(e.am.slice(0, 10)) + '. Die App vergleicht ihr „Excel für CNC“ mit der Liste: gleiche Belegnummer, sonst gleiches Datum und gleicher Betrag.</p>';
    APP.modal({ title: 'Vergleich ' + L.MONATE[m] + ' ' + j, body: body, foot: '<button type="button" class="btn" data-act="schliessen">Schließen</button><button type="button" class="btn pri" data-act="monat-vergleich" data-j="' + j + '" data-m="' + m + '">Neue Liste vergleichen</button>' });
  };
  APP.A['vergleich-zeigen'] = function (el) { APP.vergleichZeigen(+el.dataset.j, +el.dataset.m); };

  APP.A['beleg-pruefen'] = function (el) {
    var g = el.dataset.g;
    return APP.lauf(el, function () {
      return APP.belegPruefen(g).then(function (pr) {
        APP.belegDialog(g);
        if (pr && pr.ok) APP.ok('Gegen das Dokument geprüft: stimmt.');
        else if (pr) APP.toast('Geprüft: bitte den Hinweis im Beleg ansehen.', { warn: true });
      });
    });
  };
})();
