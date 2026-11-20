/* S1 Tax · Monate und Belege
   Monatsliste mit allen Eingangsbelegen, Hochladen per Drag & Drop oder Foto,
   Beleg bearbeiten (Privat/Unklar, Konto, Steuer), Monatsabschluss und Prüfung. */
(function () {
  'use strict';
  var APP = window.APP, L = window.L, D = APP.D, S = APP.S, h = APP.h;
  S.uploads = [];
  S.filter = S.filter || 'alle';

  function monatStatus(j, m) {
    var mo = L.monat(D, j, m);
    var offen = D.belege.some(function (b) { return b.jahr === j && b.monat === m && !b.storniert && (!b.bestaetigt || b.status === 'unklar'); }) || D.bank.some(function (b) { return b.jahr === j && b.monat === m && b.art === 'offen'; });
    if (offen) return 'att';
    if (mo && mo.abgeschlossen_am && mo.geprueft_am && !mo.nach_pruefung_geaendert) return 'ok';
    return '';
  }
  APP.monatStatus = monatStatus;
  function steuerChip(g) {
    var a = g.rows.filter(L.zaehlt).map(function (b) { return b.steuerart; });
    if (a.indexOf('rc') >= 0) return '<span class="chip blue" title="Reverse Charge">RC</span>';
    if (a.indexOf('ig') >= 0) return '<span class="chip blue" title="innergemeinschaftlicher Erwerb">ig</span>';
    if (a.indexOf('ausland') >= 0) return '<span class="chip" title="ausländische Steuer, keine Vorsteuer">Ausl.</span>';
    return g.ust ? L.fmt(g.ust) : '–';
  }
  function statusChip(g) {
    if (g.storniert) return '<span class="chip">storniert</span>';
    if (!g.bestaetigt) return '<span class="chip yel">bitte prüfen</span>';
    if (g.status === 'privat') return '<span class="chip">privat</span>';
    if (g.status === 'unklar') return '<span class="chip warn">unklar</span>';
    if (g.privat) return '<span class="chip">davon privat ' + L.fmt(g.privat) + '</span>';
    return '';
  }
  APP.belegStatusChip = statusChip;
  function filterGr(g, f) {
    if (f === 'neu') return !g.bestaetigt && !g.storniert;
    if (f === 'unklar') return g.status === 'unklar' && !g.storniert;
    if (f === 'privat') return g.status === 'privat';
    if (f === 'bar') return g.zahlung === 'bar';
    if (f === 'ohne') return !g.datei && !g.storniert;
    if (f === 'storniert') return g.storniert;
    return !g.storniert || true;
  }
  APP.belegTabelle = function (gr, opt) {
    opt = opt || {};
    var v = L.verknuepft(D);
    if (!gr.length) return '<div class="empty">' + (opt.leer || 'Keine Belege.') + '</div>';
    var sb = 0, sn = 0, su = 0;
    var rows = gr.map(function (g) {
      if (!g.storniert && g.status !== 'privat') { sb += g.brutto - (g.privat || 0); sn += g.netto - (g.privatNetto || 0); su += g.ust - (g.privatUst || 0); }
      var cls = ['click']; if (!g.bestaetigt && !g.storniert) cls.push('neu'); if (g.status === 'privat') cls.push('privat'); if (g.storniert) cls.push('storno');
      var konto = g.rows.filter(L.aktiv).map(function (b) { return b.konto; }).filter(function (k, i, a) { return k && a.indexOf(k) === i; }).join(', ');
      var bk = v.gruppe[g.gruppe];
      return '<tr class="' + cls.join(' ') + '" data-act="beleg" data-g="' + g.gruppe + '">' +
        '<td class="num">' + (L.belegNr(g) || '<span class="mut">neu</span>') + (opt.monat ? '<div class="s">' + L.MON[g.monat] + '</div>' : '') + '</td>' +
        '<td class="num hm">' + L.datumKurz(g.datum) + '</td>' +
        '<td><b>' + h(g.lieferant || '(noch nicht gelesen)') + '</b><div class="s">' + h(g.storniert && g.notiz ? g.notiz : (g.text || '')) + '</div></td>' +
        '<td class="hm">' + h(konto) + '</td>' +
        '<td class="r num">' + L.fmt(g.brutto) + '</td>' +
        '<td class="r num hm">' + L.fmt(g.netto) + '</td>' +
        '<td class="r num">' + steuerChip(g) + '</td>' +
        '<td class="hm">' + (g.zahlung === 'bar' ? 'Bar' : bk ? '<span title="Bank ' + L.datum(bk.datum) + '">Bank ✓</span>' : '<span class="mut">Bank</span>') + '</td>' +
        '<td>' + statusChip(g) + (g.datei ? ' <span title="Datei vorhanden">' + APP.icon('datei', 14) + '</span>' : '') + '</td></tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nr.</th><th class="hm">Datum</th><th>Lieferant · Bezeichnung</th><th class="hm">Konto</th><th class="r">Brutto</th><th class="r hm">Netto</th><th class="r">Steuer</th><th class="hm">Zahlung</th><th></th></tr></thead><tbody>' + rows +
      '<tr class="sum"><td></td><td class="hm"></td><td>Summe ohne Privat</td><td class="hm"></td><td class="r num">' + L.fmt(sb) + '</td><td class="r num hm">' + L.fmt(sn) + '</td><td class="r num">' + L.fmt(su) + '</td><td class="hm"></td><td></td></tr></tbody></table></div>';
  };

  function uploadListe() {
    if (!S.uploads.length) return '';
    return '<div class="card"><div class="head"><h2>Hochgeladen</h2><button type="button" class="btn small ghost" data-act="uploads-leeren">Liste leeren</button></div><div class="prog">' +
      S.uploads.map(function (u) {
        var st = u.status === 'fertig' ? '<span class="chip ok">' + h(u.text || 'gelesen') + '</span>' : u.status === 'fehler' ? '<span class="chip bad">' + h(u.text) + '</span>' : u.status === 'wartet' ? '<span class="chip yel">wartet auf Netz</span>' : '<span class="mut"><span class="spin"></span> ' + h(u.text || 'lädt') + '</span>';
        return '<div class="row"><span>' + (u.gruppe ? '<a href="#" data-act="beleg" data-g="' + u.gruppe + '">' + h(u.name) + '</a>' : h(u.name)) + '</span>' + st + '</div>';
      }).join('') + '</div></div>';
  }

  APP.V.monat = {
    titel: function (arg) { var x = APP.jm(arg); return L.MONATE[x.monat] + ' ' + x.jahr; },
    render: function (arg) {
      var x = APP.jm(arg), j = x.jahr, m = x.monat; S.jahr = j; S.monat = m;
      var f = (String(arg).split('/')[1]) || S.filter || 'alle';
      var mo = L.monat(D, j, m), ich = APP.ich();
      var alle = L.gruppen(D.belege, function (b) { return b.jahr === j && b.monat === m; }).sort(L.sortBelege);
      var gr = alle.filter(function (g) { return filterGr(g, f) && (f === 'storniert' || !g.storniert || f === 'alle'); });
      var aktiv = alle.filter(function (g) { return !g.storniert && g.status !== 'privat'; });
      var u = L.uva(D, j, m);
      var bank = D.bank.filter(function (b) { return b.jahr === j && b.monat === m; }), bankOffen = bank.filter(function (b) { return b.art === 'offen'; }).length;
      var neu = alle.filter(function (g) { return !g.bestaetigt && !g.storniert; }).length, unklar = alle.filter(function (g) { return g.status === 'unklar' && !g.storniert; }).length;
      var status = [];
      if (mo && mo.abgeschlossen_am) status.push('<span class="chip blue">Abgeschlossen ' + L.datum(mo.abgeschlossen_am.slice(0, 10)) + (mo.abgeschlossen_von && mo.abgeschlossen_von !== 'import' ? ' · ' + APP.name(mo.abgeschlossen_von) : '') + '</span>');
      else status.push('<span class="chip">Offen · Belegnummern beim Abschluss</span>');
      if (mo && mo.geprueft_am) status.push('<span class="chip ' + (mo.nach_pruefung_geaendert ? 'warn' : 'ok') + '">Geprüft ' + L.datum(mo.geprueft_am.slice(0, 10)) + ' · ' + APP.name(mo.geprueft_von) + (mo.nach_pruefung_geaendert ? ' · danach geändert' : '') + '</span>');
      var acts = '<button type="button" class="btn" data-act="monat-excel" data-j="' + j + '" data-m="' + m + '">' + APP.icon('excel', 16) + ' Excel für CNC</button>';
      var ohneNr = alle.some(function (g) { return !g.storniert && g.status !== 'privat' && !g.nr; });
      if (ich === 'j' && (ohneNr || !(mo && mo.abgeschlossen_am))) acts += '<button type="button" class="btn pri" data-act="monat-abschliessen" data-j="' + j + '" data-m="' + m + '">' + (mo && mo.abgeschlossen_am ? 'Nachträge nummerieren' : 'Monat abschließen') + '</button>';
      acts += (mo && mo.geprueft_am && !mo.nach_pruefung_geaendert) ? '<button type="button" class="btn" data-act="monat-geprueft" data-j="' + j + '" data-m="' + m + '" data-aus="1">Prüfung zurücknehmen</button>' : '<button type="button" class="btn' + (ich === 'd' ? ' pri' : '') + '" data-act="monat-geprueft" data-j="' + j + '" data-m="' + m + '">' + APP.icon('check', 16) + ' Monat geprüft</button>';
      var chips = [['alle', 'Alle', alle.length], ['neu', 'Bitte prüfen', neu], ['unklar', 'Unklar', unklar], ['privat', 'Privat'], ['bar', 'Bar'], ['ohne', 'Ohne Datei'], ['storniert', 'Storniert']]
        .map(function (c) { return '<button type="button" class="chip" data-go="monat/' + j + '-' + m + '/' + c[0] + '" aria-pressed="' + (f === c[0]) + '">' + c[1] + (c[2] ? ' · ' + c[2] : '') + '</button>'; }).join('');
      return '<div class="top"><div><h1>' + L.MONATE[m] + ' ' + j + '</h1><div class="chips" style="margin-top:6px">' + status.join('') + '</div></div><div class="acts">' + APP.jahrWahl('monat', j, '-' + m) + acts + '</div></div>' +
        APP.monatsLeiste('monat', j, m, monatStatus) +
        '<div class="tiles">' +
        '<div class="tile"><span class="k">Eingangsbelege</span><span class="v">' + aktiv.length + '</span><span class="u">' + L.eur(aktiv.reduce(function (n, g) { return n + g.brutto; }, 0)) + ' brutto · ' + aktiv.filter(function (g) { return g.zahlung === 'bar'; }).length + ' bar</span></div>' +
        '<div class="tile"><span class="k">Vorsteuer</span><span class="v">' + L.eur(u.kz['060']) + '</span><span class="u">aus ' + u.vst.length + ' Belegzeilen' + (u.rc.length ? ' · RC ' + L.eur(u.kz['057']) : '') + '</span></div>' +
        '<button type="button" class="tile" data-go="bank/' + j + '-' + m + '"><span class="k">Bankabgleich N26</span><span class="v">' + (bank.length ? (bank.length - bankOffen) + ' von ' + bank.length : '–') + '</span><span class="u a">' + (bank.length ? (bankOffen ? bankOffen + ' offen · klären' : 'alles zugeordnet') : 'Kontoauszug einlesen') + '</span></button>' +
        '<button type="button" class="tile dark" data-go="uva/' + j + '-' + m + '"><span class="k">UVA ' + L.MONATE[m] + ' (Ist)</span><span class="v">' + L.eur(u.zahllast) + '</span><span class="u">fällig ' + L.datum(u.faellig) + (u.bezahlt ? ' · bezahlt' : u.gemeldet ? ' · gemeldet' : '') + '</span></button>' +
        '</div>' +
        '<div class="drop" id="drop"><div class="ic">' + APP.icon('upload', 24) + '</div><div class="grow"><b>PDFs hier hineinziehen</b><div class="s">Auch mehrere auf einmal. Die App liest jede Rechnung, ordnet Konto und Steuer zu und warnt bei doppelten Belegen.</div></div>' +
        '<div class="chips"><button type="button" class="btn" data-act="dateien">Dateien auswählen</button><button type="button" class="btn" data-act="foto">' + APP.icon('kamera', 16) + ' Foto</button><button type="button" class="btn" data-act="beleg-neu">Ohne Datei erfassen</button></div></div>' +
        uploadListe() +
        '<div class="card flat"><div class="head"><h2>Eingangsrechnungen</h2><div class="chips">' + chips + '</div></div>' +
        APP.belegTabelle(gr, { leer: f === 'alle' ? 'Für ' + L.MONATE[m] + ' gibt es noch keine Belege.' : 'Keine Belege mit diesem Filter.' }) + '</div>';
    },
    after: function () { dropZone(); }
  };

  /* ---------- Hochladen ---------- */
  function dropZone() {
    var z = document.getElementById('drop'); if (!z) return;
    ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('over'); }); });
    z.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) hochladen(Array.prototype.slice.call(f), { quelle: 'upload', zahlung: 'bank' }); });
  }
  /* Kamerafotos heißen am Handy oft nur aus Ziffern (17951919…jpg): dann lieber „Foto 17:27“ zeigen */
  function anzeigeName(f, opt) {
    var n = f && f.name || '';
    if (opt && opt.quelle === 'scan' || !n || /^(\d{8,}|IMG|image|photo|Foto|PXL|DSC)[\w-]*\.(jpe?g|png|heic|webp)$/i.test(n)) return 'Foto ' + new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
    return n;
  }
  function hochladen(files, opt) {
    var x = APP.jm(S.view === 'monat' ? S.arg : '');
    var ziel = opt.heute ? { jahr: +L.heute().slice(0, 4), monat: +L.heute().slice(5, 7) } : x;
    files = files.filter(function (f) { return /pdf|image/.test(f.type) || /\.(pdf|jpe?g|png|heic|webp)$/i.test(f.name); });
    if (!files.length) { APP.toast('Bitte PDF-Dateien oder Fotos verwenden.', { bad: true }); return Promise.resolve(); }
    var eintraege = files.map(function (f) { var u = { name: anzeigeName(f, opt), status: 'laedt', text: 'wird hochgeladen' }; S.uploads.unshift(u); return u; });
    APP.render();
    return files.reduce(function (p, f, i) {
      return p.then(function () {
        var u = eintraege[i];
        u.text = 'wird gelesen'; APP.render();
        return APP.belegAnlegen(f, Object.assign({ jahr: ziel.jahr, monat: ziel.monat }, opt)).then(function (r) {
          if (r && r.wartet) { u.status = 'wartet'; return; }
          if (r.abgelegt) { u.gruppe = null; u.status = 'fertig'; u.text = 'Post von ' + (r.abgelegt.stelle || 'Behörde') + ', bei den Unterlagen abgelegt'; APP.toast(APP.postText(r.r)); return r; }
          u.gruppe = r.gruppe;
          if (r.leseFehler) { u.status = 'fehler'; u.text = r.leseFehler.length > 60 ? 'selbst ausfüllen' : r.leseFehler; return r; }
          u.status = 'fertig'; u.text = (r.lieferant || 'gelesen') + ' · ' + L.eur(r.brutto) + (r.verschoben ? ' · nach ' + r.verschoben : '') + (r.auto ? ' · bestätigt' : '');
          if (r.r && r.r.doppelt) { u.status = 'fehler'; u.text = 'gibt es vermutlich schon: ' + r.r.doppelt; }
          return r;
        }).catch(function (e) { u.status = 'fehler'; u.text = e && e.message || String(e); });
      });
    }, Promise.resolve()).then(function () { APP.render(); });
  }
  APP.hochladenDateien = hochladen;
  APP.A.dateien = function () { var i = document.getElementById('f-belege'); i.value = ''; i.click(); };
  APP.A.foto = function () { var i = document.getElementById('f-foto'); i.value = ''; i.click(); };
  APP.A['uploads-leeren'] = function () { S.uploads = []; APP.render(); };
  document.addEventListener('change', function (e) {
    if (e.target.id === 'f-belege' && e.target.files.length) hochladen(Array.prototype.slice.call(e.target.files), { quelle: 'upload', zahlung: 'bank' });
    if (e.target.id === 'f-foto' && e.target.files.length) {
      var f = e.target.files[0];
      if (S.view !== 'monat') { S.uploads = []; }
      /* Foto zuerst zuschneiden und gerade richten (im Gerät, auch ohne Netz) */
      var zs = APP.zuschneiden && APP.zuschnittAn();
      var platz = zs ? { name: anzeigeName(f, { quelle: 'scan' }), status: 'laedt', text: 'wird zugeschnitten' } : null;
      if (platz) { S.uploads.unshift(platz); APP.render(); }
      (zs ? APP.zuschneiden(f) : Promise.resolve({ datei: f })).then(function (z) {
        if (platz) { var ix = S.uploads.indexOf(platz); if (ix >= 0) S.uploads.splice(ix, 1); }
        return hochladen([z.datei], { quelle: 'scan', zahlung: 'bar', heute: S.view !== 'monat' }).then(function () {
          var u = S.uploads[0];
          if (u && u.gruppe && z.zugeschnitten) { S.zuschnitt = S.zuschnitt || {}; S.zuschnitt[u.gruppe] = z.original; }
          if (u && u.gruppe) APP.belegDialog(u.gruppe, { nachScan: true });
          else if (u && u.status === 'wartet') APP.toast('Kein Netz: Das Foto ist gespeichert und wird hochgeladen, sobald Netz da ist.');
        });
      });
    }
  });

  /* ---------- vom Handy geteilte Dateien („Teilen“ → S1 Tax) ---------- */
  APP.V.geteilt = {
    titel: 'Geteilte Belege',
    render: function () { return '<div class="card"><h2>Geteilte Belege</h2><p><span class="spin"></span> werden übernommen …</p></div>'; },
    after: function () {
      if (!window.caches) { APP.go('monat'); return; }
      caches.open('s1tax-geteilt').then(function (c) {
        return c.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return c.match(k).then(function (r) { return r.blob().then(function (b) { c.delete(k); return new File([b], decodeURIComponent(r.headers.get('X-Name') || 'Beleg'), { type: b.type }); }); }); }));
        });
      }).then(function (files) {
        var h0 = L.heute();
        location.replace('#monat/' + (+h0.slice(0, 4)) + '-' + (+h0.slice(5, 7)));
        if (files.length) hochladen(files, { quelle: 'upload', zahlung: 'bank', heute: true });
      }).catch(function (e) { APP.fehler(e, 'Teilen'); APP.go('monat'); });
    }
  };

  /* ---------- Beleg bearbeiten ---------- */
  var SAETZE = [20, 13, 10, 0];
  function kontoListe() {
    var oft = {};
    D.belege.forEach(function (b) { if (b.konto) oft[b.konto] = (oft[b.konto] || 0) + 1; });
    var keys = Object.keys(window.KONTEN || {}).map(Number);
    keys.sort(function (a, b) { return (oft[b] || 0) - (oft[a] || 0) || a - b; });
    return '<datalist id="konten">' + keys.map(function (k) { return '<option value="' + k + '">' + h(window.KONTEN[k]) + '</option>'; }).join('') + '</datalist>';
  }
  /* einzelne Zeile privat, z. B. ein Getränk auf der Tankrechnung */
  function privatHaken(an) {
    return '<label class="f zp" style="flex-direction:row;gap:8px;align-items:center;font-weight:500;margin:8px 0 4px"><input type="checkbox" name="zprivat"' + (an ? ' checked' : '') + '> <span>Privat (zählt nicht als Betriebsausgabe)</span></label>';
  }
  function zeileHtml(b, i, mehr) {
    var art = b.steuerart || 'vst';
    return '<div class="card" style="background:#F8F9F6;padding:12px" data-zeile="' + i + '"' + (b.id ? ' data-id="' + b.id + '"' : '') + '>' +
      '<div class="grid">' +
      (mehr ? '<label class="f span2">Bezeichnung<input class="in" name="text" value="' + h(b.text || '') + '"></label>' : '') +
      '<label class="f">Konto<input class="in" name="konto" list="konten" inputmode="numeric" value="' + h(b.konto || '') + '"><span class="hint kname">' + h((window.KONTEN || {})[b.konto] || '') + '</span></label>' +
      '<label class="f">Brutto €<input class="in num" name="brutto" inputmode="decimal" value="' + (b.brutto !== undefined && b.brutto !== null && b.brutto !== '' ? L.fmt(b.brutto) : '') + '"></label>' +
      '<label class="f">Steuer<select class="in" name="steuerart">' + Object.keys(L.STEUERART).map(function (k) { return '<option value="' + k + '"' + (art === k ? ' selected' : '') + '>' + L.STEUERART[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f">Satz<select class="in" name="steuersatz">' + SAETZE.concat(b.steuersatz && SAETZE.indexOf(Number(b.steuersatz)) < 0 ? [Number(b.steuersatz)] : []).map(function (s) { return '<option value="' + s + '"' + (Number(b.steuersatz === null || b.steuersatz === undefined ? 20 : b.steuersatz) === s ? ' selected' : '') + '>' + s + ' %</option>'; }).join('') + '</select></label>' +
      '<label class="f">USt / Vorsteuer €<input class="in num" name="ust" inputmode="decimal" value="' + L.fmt(b.ust || 0) + '"></label>' +
      '<label class="f">Netto €<input class="in num" name="netto" inputmode="decimal" value="' + L.fmt(b.netto || 0) + '"></label>' +
      '</div>' + (mehr ? privatHaken(b.status === 'privat') + '<div><button type="button" class="btn small ghost" data-act="zeile-weg">Zeile entfernen</button></div>' : '') + '</div>';
  }
  function rechneZeile(z, quelle) {
    var get = function (n) { return z.querySelector('[name="' + n + '"]'); };
    var br = L.parse(get('brutto').value), art = get('steuerart').value, satz = Number(get('steuersatz').value);
    if (!isFinite(br)) return;
    if (quelle === 'ust') { var u = L.parse(get('ust').value); if (isFinite(u)) get('netto').value = L.fmt(br - u); return; }
    if (quelle === 'netto') { var n = L.parse(get('netto').value); if (isFinite(n)) get('ust').value = L.fmt(br - n); return; }
    var ust = art === 'vst' ? L.r2(br - br / (1 + satz / 100)) : 0;
    get('ust').value = L.fmt(ust); get('netto').value = L.fmt(br - ust);
  }
  function dateiVorschau(g) {
    if (!g.datei) return '<div class="note">Keine Datei. ' + (g.zahlung === 'bank' ? 'Der Kontoauszug gilt als Beleg, oder du lädst die Rechnung nach.' : '') + '<div style="margin-top:8px"><button type="button" class="btn small" data-act="datei-ersetzen" data-g="' + g.gruppe + '">Datei hinzufügen</button></div></div>';
    return '<div id="vorschau" class="vorschau-datei" style="display:flex;align-items:center;justify-content:center"><span class="spin"></span></div>' +
      '<div class="chips"><button type="button" class="btn small" data-act="datei-oeffnen" data-p="' + h(g.datei) + '">In neuem Fenster öffnen</button><button type="button" class="btn small ghost" data-act="datei-ersetzen" data-g="' + g.gruppe + '">Datei ersetzen</button>' + (!g.nr ? '<button type="button" class="btn small ghost" data-act="als-post" data-g="' + g.gruppe + '">Kein Beleg (Post vom Amt)</button>' : '') + '</div>';
  }
  function lesungHinweis(g) {
    var l = g.rows[0].lesung;
    var auto = g.rows.map(function (b) { return b.lesung && b.lesung.auto; }).filter(Boolean)[0];
    var autoNote = auto ? '<div class="note ok"><b>Automatisch bestätigt</b> am ' + L.datum(auto.am.slice(0, 10)) + ': ' + h(auto.grund) + '. Du kannst trotzdem alles ändern.</div>' : '';
    /* noch nicht bestätigt und anders als bisher gebucht: zeigen, wie es bisher war */
    var bisher = '';
    if (g.bestaetigt === false && !g.storniert && g.lieferant) {
      var v = L.verlauf(D, g.lieferant, g.gruppe), neuP = g.rows.filter(function (b) { return !b.storniert && b.status !== 'privat' && b.konto; }).map(function (b) { return b.konto + '|' + (b.steuerart || 'vst'); });
      if (v.gruppen && neuP.some(function (p) { return !v.paare[p]; }))
        bisher = '<div class="note warn"><b>Bisher bei ' + h(g.lieferant) + ' so gebucht:</b> ' + Object.keys(v.paare).sort(function (a, b) { return v.paare[b] - v.paare[a]; }).slice(0, 3).map(function (p) { return L.paarText(p, v.paare[p]); }).join('; ') + '. Deshalb bitte prüfen.</div>';
    }
    if (!l || !l.ki) return autoNote + bisher;
    var k = l.ki, t = [];
    if (k.begruendung) t.push(h(k.begruendung));
    if (k.an_s1 === false) t.push('<b>Achtung:</b> Die Rechnung scheint nicht an S1 Secure zu gehen.');
    if (k.frage) t.push('<b>Frage der App:</b> ' + h(k.frage));
    var dg = k.doppelt_gruppe && L.gruppen(D.belege, function (b) { return b.gruppe === k.doppelt_gruppe; })[0];
    var doppel = '';
    if (k.doppelt && g.bestaetigt === false && !g.storniert) {
      doppel = '<div class="note warn"><b>Diesen Beleg gibt es vermutlich schon:</b> ' + h(k.doppelt) + '. Er zählt deshalb vorerst nirgends mit.' +
        (dg ? '<div class="chips" style="margin-top:8px"><button type="button" class="btn small pri" data-act="doppelt-anhaengen" data-g="' + g.gruppe + '" data-ziel="' + dg.gruppe + '">Datei an ' + (L.belegNr(dg) ? 'Beleg ' + L.belegNr(dg) : 'den bestehenden Beleg') + ' hängen</button><button type="button" class="btn small" data-act="beleg" data-g="' + dg.gruppe + '">Bestehenden Beleg ansehen</button><button type="button" class="btn small ghost" data-act="doppelt-nein" data-g="' + g.gruppe + '">Ist kein Doppel</button></div>' : '') + '</div>';
    }
    return autoNote + (t.length ? '<div class="note blue"><b>Von der App gelesen.</b> ' + t.join(' ') + '</div>' : '') + bisher + doppel;
  }
  function fragenBlock(tabelle, ids) {
    var fr = D.fragen.filter(function (f) { return f.tabelle === tabelle && ids.indexOf(f.datensatz) >= 0; });
    return '<div class="card" style="padding:12px;background:#F8F9F6"><h3>Rückfragen</h3>' +
      (fr.length ? fr.map(function (f) {
        return '<div style="border-top:1px solid var(--line);padding-top:8px"><div class="s">' + APP.name(f.von) + ' · ' + L.datum(f.created_at.slice(0, 10)) + (f.erledigt ? ' · erledigt' : '') + '</div><div>' + h(f.text) + '</div>' +
          (f.antwort ? '<div class="s" style="margin-top:4px">Antwort ' + APP.name(f.antwort_von) + ': <span style="color:var(--ink)">' + h(f.antwort) + '</span></div>' : '') +
          (!f.erledigt ? '<div class="chips" style="margin-top:6px">' + (!f.antwort && f.von !== APP.ich() ? '<button type="button" class="btn small" data-act="frage-antworten" data-id="' + f.id + '">Antworten</button>' : '') + '<button type="button" class="btn small ghost" data-act="frage-erledigt" data-id="' + f.id + '">Erledigt</button></div>' : '') + '</div>';
      }).join('') : '<div class="s">Noch keine.</div>') +
      '<div style="display:flex;gap:8px;margin-top:6px"><input class="in" id="neue-frage" placeholder="Frage an ' + (APP.ich() === 'j' ? 'Dagmar' : 'Jürgen') + '"><button type="button" class="btn" data-act="frage-stellen" data-t="' + tabelle + '" data-id="' + ids[0] + '">Fragen</button></div></div>';
  }
  APP.fragenBlock = fragenBlock;

  APP.belegDialog = function (gruppe, opt) {
    opt = opt || {};
    var g = gruppe ? L.gruppen(D.belege, function (b) { return b.gruppe === gruppe; })[0] : null;
    var neu = !g;
    var jm = APP.jm(S.view === 'monat' ? S.arg : '');
    if (neu) g = { gruppe: null, rows: [Object.assign({ steuerart: 'vst', steuersatz: 20, konto: '', brutto: '', ust: 0, netto: 0, text: '' }, opt.vorgabe || {})], jahr: (opt.vorgabe || {}).jahr || jm.jahr, monat: (opt.vorgabe || {}).monat || jm.monat, zahlung: (opt.vorgabe || {}).zahlung || 'bar', status: 'geschaeftlich', bestaetigt: true, datum: (opt.vorgabe || {}).datum || '', lieferant: (opt.vorgabe || {}).lieferant || '' };
    var rows = g.rows.filter(function (b) { return !b.storniert || g.storniert; });
    var f = g.rows[0], mehr = rows.length > 1;
    var bk = !neu && L.verknuepft(D).gruppe[g.gruppe];
    var monate = '';
    for (var i = -3; i <= 3; i++) { var x = L.monatPlus(g.jahr, g.monat, i); monate += '<option value="' + x.jahr + '-' + x.monat + '"' + (i === 0 ? ' selected' : '') + '>' + L.MONATE[x.monat] + ' ' + x.jahr + '</option>'; }
    var titel = neu ? 'Neuer Beleg' : 'Beleg ' + (L.belegNr(g) || '(noch ohne Nummer)') + (g.lieferant ? ' · ' + g.lieferant : '');
    var body = (opt.nachScan ? '<div class="note blue">Bitte kurz prüfen und speichern. ' + (f.lesung && f.lesung.ki ? '' : 'Was die App nicht lesen konnte, bitte ergänzen.') + '</div>' : '') +
      (g.storniert ? '<div class="note bad">Dieser Beleg ist storniert und zählt nirgends mit.</div>' : '') +
      (!neu && S.zuschnitt && S.zuschnitt[g.gruppe] ? '<div class="note" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="grow">Foto automatisch zugeschnitten und gerade gerichtet.</span><button type="button" class="btn small" data-act="zuschnitt-original" data-g="' + h(g.gruppe) + '">Ganzes Foto verwenden</button></div>' : '') +
      (!neu ? lesungHinweis(g) : '') +
      '<div class="cols"><div class="narrow" style="flex-basis:340px">' + (neu ? '<div class="note">Für Belege ohne Datei, z. B. wenn der Kontoauszug als Beleg reicht. Foto oder PDF kannst du danach hinzufügen.</div>' : dateiVorschau(g)) +
      (bk ? '<div class="note ok" style="margin-top:8px">Mit dem Konto verbunden: ' + L.datum(bk.datum) + ' · ' + h(bk.name) + ' · ' + L.eur(bk.betrag) + '</div>' : (!neu && g.zahlung === 'bank' ? '<div class="note" style="margin-top:8px">Noch keiner Bankbuchung zugeordnet.</div>' : '')) +
      '</div><div class="wide" style="display:flex;flex-direction:column;gap:12px" id="beleg-form">' +
      '<div class="grid">' +
      '<label class="f">Datum<input class="in" name="datum" placeholder="TT.MM.JJJJ" value="' + h(L.datum(g.datum)) + '" ' + (neu ? 'autofocus' : '') + '></label>' +
      '<label class="f span2">Lieferant<input class="in" name="lieferant" value="' + h(g.lieferant || '') + '"></label>' +
      (mehr ? '' : '<label class="f span2">Bezeichnung<input class="in" name="text0" value="' + h(f.text || '') + '"></label>') +
      '<label class="f">Rechnungsnr.<input class="in" name="rechnungsnr" value="' + h(f.rechnungsnr || '') + '"></label>' +
      '<label class="f">Monat<select class="in" name="jm"' + (g.nr ? ' disabled title="Hat schon eine Belegnummer"' : '') + '>' + monate + '</select></label>' +
      '</div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><div class="seg" role="group" aria-label="Zahlung" data-seg="zahlung">' +
      ['bank', 'bar'].map(function (z) { return '<button type="button" data-v="' + z + '" aria-pressed="' + (g.zahlung === z) + '">' + (z === 'bank' ? 'Bank / Karte' : 'Bar') + '</button>'; }).join('') + '</div>' +
      '<div class="seg status" role="group" aria-label="Geschäftlich oder privat" data-seg="status">' +
      [['geschaeftlich', 'Geschäftlich'], ['privat', 'Privat'], ['unklar', 'Unklar']].map(function (z) { return '<button type="button" data-v="' + z[0] + '" aria-pressed="' + (g.status === z[0]) + '">' + z[1] + '</button>'; }).join('') + '</div></div>' +
      '<div id="zeilen" style="display:flex;flex-direction:column;gap:8px">' + rows.map(function (b, i) { return zeileHtml(b, i, mehr); }).join('') + '</div>' +
      '<div><button type="button" class="btn small" data-act="zeile-neu">+ Zeile (anderer Steuersatz oder Konto)</button></div>' +
      '<div class="grid">' +
      '<label class="f" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="anlage"' + (f.anlage ? ' checked' : '') + '> Anlagegut (über 1.000 € netto)</label>' +
      '<label class="f">Garantie bis<input class="in" type="date" name="garantie_bis" value="' + h(f.garantie_bis || '') + '"></label>' +
      '<label class="f span2">Notiz<input class="in" name="notiz" value="' + h(f.notiz || '') + '"></label>' +
      '</div>' + kontoListe() +
      (!neu ? fragenBlock('belege', g.rows.map(function (b) { return b.id; })) : '') +
      '</div></div>';
    var foot = '<div class="left">' + (!neu ? (g.storniert ? '<button type="button" class="btn" data-act="beleg-storno" data-g="' + g.gruppe + '" data-zurueck="1">Wiederherstellen</button>' : '<button type="button" class="btn danger" data-act="beleg-storno" data-g="' + g.gruppe + '">Stornieren</button>') +
      (g.datei ? '<button type="button" class="btn" data-act="beleg-lesen" data-g="' + g.gruppe + '">Neu lesen</button>' : '') : '') + '</div>' +
      '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn pri" data-act="beleg-speichern" data-g="' + (g.gruppe || '') + '">' + (!neu && !g.bestaetigt ? 'Bestätigen und speichern' : 'Speichern') + '</button>';
    var d = APP.modal({ title: titel, body: body, foot: foot, wide: true });
    d._beleg = { g: neu ? null : g, neu: neu, bank: opt.bank || null, zahlung: g.zahlung, status: g.status };
    if (g.datei) APP.dateiUrl('belege', g.datei).then(function (u) {
      var v = document.getElementById('vorschau'); if (!v) return;
      var img = /\.(jpe?g|png|webp|heic)$/i.test(g.datei);
      v.outerHTML = img ? '<img class="vorschau-datei" src="' + h(u) + '" alt="Beleg">' : '<iframe class="vorschau-datei" src="' + h(u) + '#view=FitH" title="Beleg"></iframe>';
    }, function () { var v = document.getElementById('vorschau'); if (v) v.innerHTML = '<span class="mut">Vorschau nicht verfügbar</span>'; });
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('#dlg [data-seg] button'); if (!b) return;
    var seg = b.parentNode, d = document.getElementById('dlg');
    APP.$$('button', seg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    if (d._beleg) d._beleg[seg.dataset.seg] = b.dataset.v;
  });
  document.addEventListener('input', function (e) {
    var z = e.target.closest('#zeilen [data-zeile]'); if (!z) return;
    var n = e.target.name;
    if (n === 'konto') { var k = z.querySelector('.kname'); if (k) k.textContent = (window.KONTEN || {})[e.target.value] || ''; return; }
  });
  document.addEventListener('change', function (e) {
    var z = e.target.closest('#zeilen [data-zeile]'); if (!z) return;
    var n = e.target.name;
    if (n === 'brutto' || n === 'steuerart' || n === 'steuersatz') rechneZeile(z, 'brutto');
    else if (n === 'ust' || n === 'netto') rechneZeile(z, n);
    if (n === 'konto' && L.kfz(e.target.value)) {
      var art = z.querySelector('[name="steuerart"]'); if (art.value === 'vst') { art.value = 'keine'; rechneZeile(z, 'brutto'); APP.toast('PKW-Konto: kein Vorsteuerabzug.'); }
    }
  });
  APP.A['zeile-neu'] = function () {
    var box = document.getElementById('zeilen'), n = box.children.length;
    if (n === 1 && !box.querySelector('[name="text"]')) {
      var t = document.querySelector('#beleg-form [name="text0"]');
      var first = box.children[0], wrap = document.createElement('label');
      wrap.className = 'f span2'; wrap.innerHTML = 'Bezeichnung<input class="in" name="text" value="' + h(t ? t.value : '') + '">';
      first.querySelector('.grid').prepend(wrap);
      if (t) t.closest('label').remove();
      if (!first.querySelector('[name="zprivat"]')) first.querySelector('.grid').insertAdjacentHTML('afterend', privatHaken(false) + '<div><button type="button" class="btn small ghost" data-act="zeile-weg">Zeile entfernen</button></div>');
    }
    var div = document.createElement('div'); div.innerHTML = zeileHtml({ steuerart: 'vst', steuersatz: 10, konto: (box.querySelector('[name="konto"]') || {}).value || '' }, n, true);
    box.appendChild(div.firstChild);
  };
  APP.A['zeile-weg'] = function (el) { var z = el.closest('[data-zeile]'); if (document.querySelectorAll('#zeilen [data-zeile]').length > 1) z.remove(); };
  APP.A.beleg = function (el) { APP.belegDialog(el.dataset.g); };
  APP.A['beleg-neu'] = function () { APP.belegDialog(null); };
  APP.A['datei-oeffnen'] = function (el) { APP.oeffnen('belege', el.dataset.p); };

  APP.A['beleg-speichern'] = function (el) {
    var d = document.getElementById('dlg'), st = d._beleg, form = document.getElementById('beleg-form');
    var v = APP.formDaten(form);
    var datum = v.datum ? L.isoAus(v.datum) : null;
    if (v.datum && !datum) { APP.toast('Bitte das Datum als TT.MM.JJJJ eingeben.', { bad: true }); return; }
    var jm = (v.jm || '').split('-'), jahr = st.g ? st.g.jahr : +jm[0], monat = st.g ? st.g.monat : +jm[1];
    if (v.jm && !(st.g && st.g.nr)) { jahr = +jm[0]; monat = +jm[1]; }
    var zeilen = APP.$$('#zeilen [data-zeile]').map(function (z) {
      var q = function (n) { var x = z.querySelector('[name="' + n + '"]'); return x ? x.value : ''; };
      var brutto = L.parse(q('brutto')), ust = L.parse(q('ust')), netto = L.parse(q('netto'));
      var zp = z.querySelector('[name="zprivat"]');
      return { privat: !!(zp && zp.checked), id: z.dataset.id || null, text: z.querySelector('[name="text"]') ? q('text') : v.text0, konto: q('konto') ? Number(q('konto')) : null, brutto: L.r2(brutto), ust: L.r2(isFinite(ust) ? ust : 0), netto: L.r2(isFinite(netto) ? netto : brutto), steuerart: q('steuerart'), steuersatz: q('steuerart') === 'vst' || q('steuerart') === 'rc' || q('steuerart') === 'ig' ? Number(q('steuersatz')) : null };
    });
    var fehler = '';
    zeilen.forEach(function (z) {
      if (!isFinite(z.brutto)) fehler = 'Bitte bei jeder Zeile den Bruttobetrag eintragen.';
      else if (st.status !== 'privat' && !z.privat && !z.konto) fehler = 'Bitte bei jeder Zeile das Konto eintragen.';
      else if (z.konto && !(window.KONTEN || {})[z.konto]) fehler = 'Konto ' + z.konto + ' gibt es im Kontenrahmen nicht.';
      else if (Math.abs(z.netto + z.ust - z.brutto) > 0.011) fehler = 'Netto und Steuer ergeben nicht den Bruttobetrag (' + L.fmt(z.brutto) + ').';
      if (z.steuerart !== 'vst') z.ust = 0, z.netto = z.brutto;
    });
    if (!v.lieferant.trim() && st.status !== 'privat') fehler = fehler || 'Bitte den Lieferanten eintragen.';
    if (fehler) { APP.toast(fehler, { bad: true }); return; }
    var gemeinsam = { datum: datum, lieferant: v.lieferant.trim(), zahlung: st.zahlung, status: st.status, jahr: jahr, monat: monat, rechnungsnr: v.rechnungsnr || null, notiz: v.notiz || null, anlage: !!v.anlage, garantie_bis: v.garantie_bis || null, bestaetigt: true };
    if (!v.anlage && st.status !== 'privat' && zeilen.some(function (z) { return z.netto > 1000 && Number(z.konto) >= 4000; })) APP.toast('Hinweis: über 1.000 € netto – wenn es ein Gerät ist, als Anlagegut markieren.');
    var verdacht = st.g && st.g.rows.some(L.doppelVerdacht);
    (verdacht ? APP.bestaetigen('Die App hält diesen Beleg für ein Doppel eines bestehenden Belegs. Wenn du ihn trotzdem bestätigst, zählt er zusätzlich mit (Vorsteuer, Excel für CNC). Wirklich als eigenen Beleg speichern?', 'Ja, eigener Beleg') : Promise.resolve(true)).then(function (ok) {
    if (!ok) return;
    if (verdacht) st.g.rows.forEach(function (b) { if (b.lesung && b.lesung.ki) { b._lesung = JSON.parse(JSON.stringify(b.lesung)); b._lesung.ki.doppelt_gruppe = null; b._lesung.ki.doppelt_geprueft = APP.ich(); } });
    APP.lauf(el, function () {
      var gruppe = st.g ? st.g.gruppe : APP.uuid(), jobs = [];
      var alt = st.g ? st.g.rows.filter(function (b) { return !b.storniert; }) : [];
      zeilen.forEach(function (z) {
        var row = Object.assign({}, gemeinsam, { text: z.text || '', konto: z.konto, brutto: z.brutto, netto: z.netto, ust: z.ust, steuerart: z.steuerart, steuersatz: z.steuersatz });
        if (z.privat) row.status = 'privat';
        var alteZeile = z.id && st.g ? st.g.rows.find(function (b) { return b.id === z.id; }) : null;
        if (alteZeile && alteZeile._lesung) row.lesung = alteZeile._lesung;
        if (z.id) jobs.push(APP.upd('belege', { id: z.id }, row));
        else jobs.push(APP.ins('belege', [Object.assign(row, { gruppe: gruppe, quelle: st.g ? (st.g.quelle || 'manuell') : 'manuell', datei: st.g ? st.g.datei : null })]));
      });
      alt.forEach(function (b) { if (!zeilen.some(function (z) { return z.id === b.id; })) jobs.push(APP.upd('belege', { id: b.id }, { storniert: true })); });
      return Promise.all(jobs).then(function () {
        if (st.bank) return APP.upd('bank', { id: st.bank.id }, { art: 'beleg', beleg_gruppe: gruppe });
      }).then(function () {
        APP.schliessen(); APP.toast('Gespeichert.'); APP.render();
      });
    });
    });
  };
  /* Stornieren nur mit Grund; der Grund steht in der Notiz und im Protokoll */
  var STORNO_GRUENDE = ['Test', 'Doppelt erfasst', 'Falsch erfasst', 'Gehört nicht zu S1 Secure', 'Gutschrift / Rückerstattung'];
  function stornoNotiz(alt) { return String(alt || '').replace(/^Storniert: [^·]*(· )?/, '').trim(); }
  APP.A['beleg-storno'] = function (el) {
    var zur = !!el.dataset.zurueck, g = el.dataset.g;
    var rows = D.belege.filter(function (b) { return b.gruppe === g; });
    function ausfuehren(grund) {
      var ziel = zur ? rows : rows.filter(function (b) { return !b.storniert; });
      return Promise.all(ziel.map(function (b) {
        var rest = stornoNotiz(b.notiz);
        return APP.upd('belege', { id: b.id }, { storniert: !zur, notiz: zur ? (rest || null) : 'Storniert: ' + grund + (rest ? ' · ' + rest : '') });
      })).then(function () {
        var bk = D.bank.find(function (b) { return b.beleg_gruppe === g; });
        if (!zur && bk) return APP.upd('bank', { id: bk.id }, { art: 'offen', beleg_gruppe: null });
      }).then(function () { APP.schliessen(); APP.toast(zur ? 'Wiederhergestellt.' : 'Storniert: ' + grund); APP.render(); });
    }
    if (zur) { ausfuehren('').catch(APP.fehler); return; }
    APP.modal({
      title: 'Beleg stornieren',
      body: '<p style="margin:0">Der Beleg zählt dann nirgends mehr mit. Die Datei und alle Angaben bleiben erhalten, du kannst ihn jederzeit wiederherstellen.</p>' +
        '<div class="chips">' + STORNO_GRUENDE.map(function (x) { return '<button type="button" class="chip" data-grund="' + h(x) + '">' + h(x) + '</button>'; }).join('') + '</div>' +
        '<label class="f">Grund<input class="in" id="storno-grund" placeholder="z. B. Test, doppelt, falscher Monat" autofocus></label>',
      foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn danger" id="storno-ok">Stornieren</button>'
    });
    APP.$$('#dlg [data-grund]').forEach(function (b) { b.onclick = function () { document.getElementById('storno-grund').value = b.dataset.grund; APP.$$('#dlg [data-grund]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }; });
    var okb = document.getElementById('storno-ok');
    okb.onclick = function () {
      var grund = document.getElementById('storno-grund').value.trim();
      if (!grund) { APP.toast('Bitte einen Grund angeben.', { bad: true }); return; }
      APP.lauf(okb, function () { return ausfuehren(grund); });
    };
  };
  APP.A['beleg-lesen'] = function (el) {
    var g = el.dataset.g, row = D.belege.find(function (b) { return b.gruppe === g && !b.storniert; }) || D.belege.find(function (b) { return b.gruppe === g; });
    APP.lauf(el, function () {
      return APP.belegLesen(row).then(function (r) {
        if (r.abgelegt) { APP.schliessen(); APP.toast(postText(r.r)); APP.render(); return; }
        if (r.leseFehler) APP.toast(r.leseFehler, { bad: true }); else APP.toast('Neu gelesen.'); APP.belegDialog(g); APP.render();
      });
    });
  };
  function postText(r) {
    var u = r && r.unterlage || {};
    return 'Post von ' + (u.stelle || 'Behörde') + ' bei den Unterlagen ' + u.jahr + ' abgelegt' + (r && r.geaendert && r.geaendert.length ? '. Übernommen: ' + r.geaendert.join(', ') : '') + '.';
  }
  APP.postText = postText;
  APP.A['als-post'] = function (el) {
    var g = el.dataset.g;
    APP.bestaetigen('Das ist kein Beleg, sondern Post vom Amt (z. B. Bescheid oder Benachrichtigung)? Die Datei kommt zu den Unterlagen, der Beleg verschwindet.', 'Als Post ablegen').then(function (ok) {
      if (!ok) return;
      return APP.alsPostAblegen(g).then(function (u) { APP.schliessen(); APP.toast('Bei den Unterlagen ' + u.jahr + ' abgelegt.'); APP.render(); });
    }).catch(APP.fehler);
  };
  APP.A['datei-ersetzen'] = function (el) {
    var i = document.getElementById('f-ersetzen'); i.value = ''; i.dataset.g = el.dataset.g; i.click();
  };
  function dateiErsetzen(g, file) {
    var row = D.belege.find(function (b) { return b.gruppe === g; });
    return APP.bildVerkleinern(file).then(function (blob) {
      var ext = /pdf/.test(blob.type) ? 'pdf' : /png/.test(blob.type) ? 'png' : 'jpg';
      var path = row.jahr + '/' + L.p2(row.monat) + '/' + APP.uuid() + '.' + ext;
      return APP.hochladen('belege', path, blob).then(function () {
        return Promise.all(D.belege.filter(function (b) { return b.gruppe === g; }).map(function (b) { return APP.upd('belege', { id: b.id }, { datei: path }); }));
      });
    });
  }
  APP.A['zuschnitt-original'] = function (el) {
    var g = el.dataset.g, orig = S.zuschnitt && S.zuschnitt[g];
    if (!orig) return;
    APP.lauf(el, function () {
      return dateiErsetzen(g, orig).then(function () { delete S.zuschnitt[g]; APP.toast('Das ganze Foto wird verwendet.'); APP.belegDialog(g); APP.render(); });
    });
  };
  document.addEventListener('change', function (e) {
    if (e.target.id !== 'f-ersetzen' || !e.target.files.length) return;
    var g = e.target.dataset.g, file = e.target.files[0];
    dateiErsetzen(g, file).then(function () {
      APP.toast('Datei gespeichert. Die alte Datei bleibt im Archiv.');
      return APP.bestaetigen('Soll die App die neue Datei lesen und die Angaben vorschlagen?', 'Lesen').then(function (ok) { if (ok) return APP.belegLesen(D.belege.find(function (b) { return b.gruppe === g; })); });
    }).then(function () { APP.belegDialog(g); APP.render(); }).catch(function (e) { APP.fehler(e, 'Datei'); });
  });

  /* ---------- doppelte Belege: Datei an den bestehenden Beleg hängen ---------- */
  APP.A['doppelt-anhaengen'] = function (el) {
    var neu = D.belege.filter(function (b) { return b.gruppe === el.dataset.g; }), ziel = D.belege.filter(function (b) { return b.gruppe === el.dataset.ziel && !b.storniert; });
    if (!neu.length || !ziel.length) return;
    var n0 = neu[0], zg = L.gruppen(ziel)[0], name = L.belegNr(zg) ? 'Beleg ' + L.belegNr(zg) : 'den bestehenden Beleg';
    var weiter = zg.datei && zg.datei !== n0.datei ? APP.bestaetigen(h(name) + ' hat schon eine Datei. Durch diese ersetzen? Die alte bleibt im Archiv.', 'Ersetzen') : Promise.resolve(true);
    weiter.then(function (ok) {
      if (!ok) return;
      return APP.lauf(el, function () {
        return Promise.all(ziel.map(function (b) {
          return APP.upd('belege', { id: b.id }, { datei: n0.datei, rechnungsnr: b.rechnungsnr || n0.rechnungsnr, lieferant_uid: b.lieferant_uid || n0.lieferant_uid, land: b.land || n0.land, volltext: n0.volltext || b.volltext, lesung: Object.assign({}, b.lesung || {}, { hash: (n0.lesung || {}).hash, angehaengt: new Date().toISOString() }) });
        })).then(function () {
          return Promise.all(neu.map(function (b) { return APP.upd('belege', { id: b.id }, { storniert: true, notiz: 'Doppelt: Datei an ' + name + ' angehängt' }); }));
        }).then(function () { APP.toast('Datei an ' + name + ' angehängt, der doppelte Eintrag ist storniert.'); APP.belegDialog(zg.gruppe); APP.render(); });
      });
    }).catch(APP.fehler);
  };
  APP.A['doppelt-nein'] = function (el) {
    var rows = D.belege.filter(function (b) { return b.gruppe === el.dataset.g; });
    APP.lauf(el, function () {
      return Promise.all(rows.map(function (b) {
        var l = JSON.parse(JSON.stringify(b.lesung || {})); if (l.ki) { l.ki.doppelt = null; l.ki.doppelt_gruppe = null; l.ki.doppelt_geprueft = APP.ich(); }
        return APP.upd('belege', { id: b.id }, { lesung: l });
      })).then(function () { APP.toast('Gut, der Beleg zählt wieder mit.'); APP.belegDialog(el.dataset.g); APP.render(); });
    });
  };

  /* ---------- Rückfragen ---------- */
  APP.A['frage-stellen'] = function (el) {
    var t = (document.getElementById('neue-frage') || {}).value || '';
    if (!t.trim()) { APP.toast('Bitte die Frage eintragen.', { bad: true }); return; }
    var row = D.belege.find(function (b) { return b.id === el.dataset.id; }) || D.bank.find(function (b) { return b.id === el.dataset.id; }) || D.ausgang.find(function (b) { return b.id === el.dataset.id; }) || {};
    APP.lauf(el, function () {
      return APP.ins('fragen', [{ tabelle: el.dataset.t, datensatz: el.dataset.id, jahr: row.jahr || null, monat: row.monat || null, text: t.trim(), an: APP.ich() === 'j' ? 'd' : 'j' }]).then(function () {
        if (el.dataset.t === 'belege' && row.gruppe) return Promise.all(D.belege.filter(function (b) { return b.gruppe === row.gruppe && !b.storniert && b.status !== 'privat'; }).map(function (b) { return APP.upd('belege', { id: b.id }, { status: 'unklar' }); }));
      }).then(function () { APP.toast('Frage gestellt. ' + (APP.ich() === 'j' ? 'Dagmar' : 'Jürgen') + ' bekommt eine Mitteilung.'); APP.fn('erinnerungen', {}, 'jetzt').catch(function () {}); if (row.gruppe) APP.belegDialog(row.gruppe); APP.render(); });
    });
  };
  APP.A['frage-antworten'] = function (el) {
    var f = D.fragen.find(function (x) { return x.id === el.dataset.id; });
    APP.modal({
      title: 'Antworten', body: '<p style="margin:0">' + h(f.text) + '</p><label class="f">Antwort<textarea class="in" id="antwort" autofocus></textarea></label>' +
        '<label class="f" style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="antwort-fertig" checked> Damit ist die Frage erledigt</label>',
      foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn pri" data-act="antwort-senden" data-id="' + f.id + '">Antworten</button>'
    });
  };
  APP.A['antwort-senden'] = function (el) {
    var t = document.getElementById('antwort').value.trim(), fertig = document.getElementById('antwort-fertig').checked;
    if (!t) return;
    APP.lauf(el, function () {
      return APP.upd('fragen', { id: el.dataset.id }, { antwort: t, antwort_von: APP.ich(), antwort_am: new Date().toISOString(), erledigt: fertig }).then(function () {
        APP.schliessen(); APP.toast('Antwort gespeichert.'); APP.fn('erinnerungen', {}, 'jetzt').catch(function () {}); APP.render();
      });
    });
  };
  APP.A['frage-erledigt'] = function (el) {
    APP.upd('fragen', { id: el.dataset.id }, { erledigt: true }).then(function () { APP.toast('Erledigt.'); APP.schliessen(); APP.render(); }).catch(APP.fehler);
  };

  /* ---------- Monat abschließen, prüfen, Excel ---------- */
  APP.A['monat-abschliessen'] = function (el) {
    var j = +el.dataset.j, m = +el.dataset.m;
    var neu = L.gruppen(D.belege, function (b) { return b.jahr === j && b.monat === m && !b.storniert && !b.bestaetigt; }).length;
    var ohneNr = L.gruppen(D.belege, function (b) { return b.jahr === j && b.monat === m && !b.storniert && b.status !== 'privat' && !b.nr; }).length;
    var bank = D.bank.filter(function (b) { return b.jahr === j && b.monat === m && b.art === 'offen'; }).length;
    var warn = [];
    if (neu) warn.push(neu + ' Beleg(e) noch nicht bestätigt');
    if (bank) warn.push(bank + ' Bankbuchung(en) ohne Beleg');
    if (!ohneNr) { APP.toast('Alle Belege in ' + L.MONATE[m] + ' haben schon eine Nummer.'); return; }
    APP.bestaetigen(ohneNr + ' Beleg(e) bekommen jetzt fortlaufende Nummern (zuerst nach Kontoauszug, dann Barbelege).' + (warn.length ? '<br><br><b>Noch offen:</b> ' + warn.join(', ') + '. Du kannst trotzdem abschließen; Nachträge bekommen später die nächste freie Nummer.' : ''), 'Abschließen').then(function (ok) {
      if (!ok) return;
      return APP.lauf(el, function () {
        return APP.rpc('monat_abschliessen', { p_jahr: j, p_monat: m }).then(function (n) { return APP.laden().then(function () { APP.toast(n + ' Belegnummern vergeben.'); APP.render(); }); });
      });
    });
  };
  APP.A['monat-geprueft'] = function (el) {
    var j = +el.dataset.j, m = +el.dataset.m, aus = !!el.dataset.aus;
    var patch = aus ? { jahr: j, monat: m, geprueft_am: null, geprueft_von: null } : { jahr: j, monat: m, geprueft_am: new Date().toISOString(), geprueft_von: APP.ich(), nach_pruefung_geaendert: false };
    APP.lauf(el, function () {
      var mo = L.monat(D, j, m);
      return (mo ? APP.upd('monate', { jahr: j, monat: m }, patch) : APP.ins('monate', [patch])).then(function () {
        APP.toast(aus ? 'Prüfung zurückgenommen.' : L.MONATE[m] + ' als geprüft markiert.'); APP.fn('erinnerungen', {}, 'jetzt').catch(function () {}); APP.render();
      });
    });
  };
  APP.A['monat-excel'] = function (el) {
    var j = +el.dataset.j, m = +el.dataset.m;
    APP.lauf(el, function () { return window.XLSXW.build(L.monatsExcel(D, j, m)).then(function (blob) { APP.speichernUnter(blob, L.monatsDatei(j, m)); }); });
  };
})();
