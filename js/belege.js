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
    var sc = L.sicherheit(D, g);
    if (sc.stufe === 'bad') return '<span class="chip bad" title="' + h(sc.zeilen.filter(function (z) { return z.a === 'bad'; }).map(function (z) { return z.t; }).join(' ')) + '">' + (sc.bank && sc.bank.stufe === 'diff' ? 'Bank ' + (sc.bank.diff > 0 ? '+' : '−') + L.fmt(Math.abs(sc.bank.diff)) : 'Betrag prüfen') + '</span>';
    if (L.wartend(D)[g.gruppe]) return '<span class="chip yel" title="Zählt erst im Monat der Zahlung">noch nicht bezahlt</span>';
    if (sc.stufe === 'warn') return '<span class="chip warn" title="' + h(sc.zeilen.filter(function (z) { return z.a === 'warn'; }).map(function (z) { return z.t; }).join(' ')) + '">Betrag prüfen</span>';
    return '';
  }
  /* Gegenprobe im Beleg: woher die Werte bestätigt sind, und was nicht passt */
  function pruefNote(g) {
    if (g.storniert) return '';
    var sc = L.sicherheit(D, g);
    if (!sc.zeilen.length) return '';
    var titel = { geprueft: 'Doppelt geprüft', vorlaeufig: 'Geprüft, Abbuchung fehlt noch', warn: 'Bitte den Betrag prüfen', bad: 'Abweichung', offen: 'Gegenprobe' }[sc.stufe];
    var cls = { geprueft: 'ok', vorlaeufig: 'ok', warn: 'warn', bad: 'bad', offen: '' }[sc.stufe];
    var icon = { ok: '✓', warn: '!', bad: '!', info: '·' };
    var knopf = sc.zeilen.some(function (z) { return z.pruefen; }) ? '<div style="margin-top:8px"><button type="button" class="btn small" data-act="beleg-pruefen" data-g="' + g.gruppe + '" data-busy="Prüfe …">Jetzt gegen das Dokument prüfen</button></div>' : '';
    return '<div class="note pruef ' + cls + '"><b>' + titel + '</b><ul>' + sc.zeilen.map(function (z) { return '<li class="' + z.a + '"><span aria-hidden="true">' + icon[z.a] + '</span> ' + h(z.t) + '</li>'; }).join('') + '</ul>' + knopf + '</div>';
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
        '<td><b>' + h(g.lieferant || '(noch nicht gelesen)') + '</b><div class="s">' + h(g.storniert && g.notiz ? g.notiz : (g.text || '')) + (g.storniert ? '' : h(L.bewirtungText(g))) + '</div></td>' +
        '<td class="hm">' + h(konto) + '</td>' +
        '<td class="r num">' + L.fmt(g.brutto) + '</td>' +
        '<td class="r num hm">' + L.fmt(g.netto) + '</td>' +
        '<td class="r num">' + steuerChip(g) + '</td>' +
        '<td class="hm">' + (g.zahlung === 'bar' ? 'Bar' : (bk ? '<span title="Bank ' + L.datum(bk.datum) + '">Bank ✓</span>' : '<span class="mut">Bank</span>') + (L.barAnteil(g) ? ' <span title="' + L.eur(L.barAnteil(g)) + ' bar angezahlt">+ bar</span>' : '')) + '</td>' +
        '<td>' + statusChip(g) + (g.datei ? ' <span title="' + (g.seiten.length ? (g.seiten.length + 1) + ' Seiten' : 'Datei vorhanden') + '">' + APP.icon('datei', 14) + (g.seiten.length ? '<small>' + (g.seiten.length + 1) + '</small>' : '') + '</span>' : '') + '</td></tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nr.</th><th class="hm">Datum</th><th>Lieferant · Bezeichnung</th><th class="hm">Konto</th><th class="r">Brutto</th><th class="r hm">Netto</th><th class="r">Steuer</th><th class="hm">Zahlung</th><th></th></tr></thead><tbody>' + rows +
      '<tr class="sum"><td></td><td class="hm"></td><td>Summe ohne Privat</td><td class="hm"></td><td class="r num">' + L.fmt(sb) + '</td><td class="r num hm">' + L.fmt(sn) + '</td><td class="r num">' + L.fmt(su) + '</td><td class="hm"></td><td></td></tr></tbody></table></div>';
  };

  function uploadListe() {
    if (!S.uploads.length) return '';
    return '<div class="card"><div class="head"><h2>Hochgeladen</h2><button type="button" class="btn small ghost" data-act="uploads-leeren">Liste leeren</button></div><div class="prog">' +
      S.uploads.map(function (u) {
        var a = upArt(u), cls = a === 'fehler' ? 'bad' : 'warn';
        var st = a === 'ok' ? '<span class="chip ok">✓ ' + h(u.text || 'gelesen') + '</span>'
          : a === 'laeuft' ? '<span class="mut"><span class="spin"></span> ' + h(u.text || 'lädt') + '</span>'
          : a === 'wartet' ? '<span class="chip yel">' + h(u.text || 'wartet auf Netz') + '</span>'
          : u.ziel ? '<button type="button" class="chip ' + cls + '" data-act="doppelt-zeigen" data-g="' + h(u.gruppe || '') + '" data-ziel="' + h(u.ziel) + '" title="Bestehenden Beleg ansehen">' + h(u.text) + ' · ansehen</button>'
          : '<span class="chip ' + cls + '">' + (a === 'fehler' ? 'nicht hochgeladen: ' : '') + h(u.text) + '</span>';
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
      acts += '<button type="button" class="btn" data-act="monat-vergleich" data-j="' + j + '" data-m="' + m + '" title="Monatsliste (eigene oder von der CNC) hochladen und Zeile für Zeile vergleichen">Mit Liste vergleichen</button>';
      var vg = (D.einst.vergleiche || {})[j + '-' + m];
      if (vg) { var vgt = APP.vergleichText(vg); status.push('<button type="button" class="chip ' + (vgt.probleme ? 'warn' : 'ok') + '" data-act="vergleich-zeigen" data-j="' + j + '" data-m="' + m + '">Vergleich: ' + h(vgt.text) + '</button>'); }
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
  /* ---------- Rückmeldung beim Hochladen ----------
     Eine Leiste unten (auf jeder Seite und auch über einem offenen Beleg): läuft · hat geklappt · was nicht ging und warum.
     Bei Problemen bleibt sie stehen, bis man sie schließt. Ist die App im Hintergrund, kommt eine Mitteilung. */
  S.upPanel = [];
  var upTimer = null;
  function upArt(u) { return u.art || (u.status === 'laedt' ? 'laeuft' : u.status === 'wartet' ? 'wartet' : u.status === 'fehler' ? 'fehler' : 'ok'); }
  function upNeu(name) { var u = { name: name, status: 'laedt', text: 'wird hochgeladen' }; S.uploads.unshift(u); return u; }
  function upStart(list) {
    clearTimeout(upTimer);
    /* offene Probleme vom letzten Mal bleiben stehen, Erledigtes geht weg */
    S.upPanel = S.upPanel.filter(function (u) { var a = upArt(u); return a === 'laeuft' || a === 'fehler' || a === 'pruefen'; }).concat(list);
    APP.upLeiste();
  }
  function upErgebnis(u, r) {
    if (!r) { u.status = 'fertig'; u.art = 'ok'; return r; }
    if (r.wartet) { u.status = 'wartet'; u.art = 'wartet'; u.text = r.grund || 'kein Netz · ist gespeichert und geht automatisch raus'; return r; }
    if (r.abgelegt && r.r && r.r.schon) { u.gruppe = null; u.status = 'fehler'; u.art = 'schon'; u.text = 'schon abgelegt: ' + (r.abgelegt.stelle || 'Behörde') + ' – ' + (r.abgelegt.titel || ''); return r; }
    if (r.abgelegt) { u.gruppe = null; u.status = 'fertig'; u.art = 'ok'; u.post = true; u.jahr = r.abgelegt.jahr; u.text = 'Post von ' + (r.abgelegt.stelle || 'Behörde') + ', bei den Unterlagen abgelegt'; return r; }
    u.gruppe = r.gruppe; u.jahr = r.jahr; u.monat = r.monat;
    if (r.leseFehler) { u.status = 'fehler'; u.art = 'pruefen'; u.text = r.leseFehler.length > 60 ? 'hochgeladen, aber nicht gelesen · bitte selbst ausfüllen' : r.leseFehler; return r; }
    u.status = 'fertig'; u.art = 'ok'; u.auto = !!r.auto;
    u.text = (r.lieferant || 'gelesen') + ' · ' + L.eur(r.brutto) + (r.verschoben ? ' · nach ' + r.verschoben : '') + (r.auto ? ' · bestätigt' : '');
    if (r.r && r.r.doppelt) { u.status = 'fehler'; u.art = 'pruefen'; u.text = 'gibt es vermutlich schon: ' + r.r.doppelt; u.ziel = r.r.doppelt_gruppe || null; }
    if (r.r && r.r.fremd) { u.status = 'fehler'; u.art = 'pruefen'; u.text = 'geht an ' + r.r.fremd + ', nicht an S1 Secure · zählt vorerst nicht mit'; }
    return r;
  }
  function upFehler(u, e) {
    u.status = 'fehler';
    if (e && e.doppelt) { u.art = 'schon'; u.text = (e.message || 'gibt es schon').replace(/\.$/, ''); if (e.doppelt.gruppe) u.ziel = e.doppelt.gruppe; }
    else { u.art = 'fehler'; u.text = APP.fehlerText(e); }
  }
  function upZahl(n, eins, mehr) { return n === 1 ? '1 ' + eins : n + ' ' + mehr; }
  function upZusammen() {
    var l = S.upPanel, n = { laeuft: 0, ok: 0, pruefen: 0, schon: 0, wartet: 0, fehler: 0 }, auto = 0;
    l.forEach(function (u) { n[upArt(u)]++; if (u.auto) auto++; });
    var hoch = n.ok + n.pruefen, z = { n: n, art: 'ok', kopf: '', sub: '' };
    if (n.laeuft) {
      var akt = l.filter(function (u) { return upArt(u) === 'laeuft'; })[0], fertig = l.length - n.laeuft;
      var tun = /gelesen/.test(akt.text || '') ? 'gelesen' : 'hochgeladen';
      z.art = 'run'; z.kopf = l.length === 1 ? 'Beleg wird ' + tun + ' …' : 'Beleg ' + (fertig + 1) + ' von ' + l.length + ' wird ' + tun + ' …'; z.sub = akt.name;
      return z;
    }
    if (n.fehler) { z.art = 'bad'; z.kopf = upZahl(n.fehler, 'Beleg', 'Belege') + ' nicht hochgeladen'; if (hoch) z.sub = upZahl(hoch, 'anderer ist', 'andere sind') + ' hochgeladen.'; }
    else if (!hoch && n.schon && !n.wartet) { z.art = 'warn'; z.kopf = n.schon === 1 ? 'Gibt es schon, nicht doppelt hochgeladen' : n.schon + ' gibt es schon, nicht doppelt hochgeladen'; }
    else if (!hoch && n.wartet) { z.art = 'warn'; z.kopf = 'Noch nicht hochgeladen: ' + upZahl(n.wartet, 'Beleg wartet', 'Belege warten') + ' auf dem Gerät'; z.sub = 'Geht automatisch raus, sobald die Verbindung wieder da ist. Nichts geht verloren.'; }
    else {
      z.art = n.pruefen || n.schon || n.wartet ? 'warn' : 'ok';
      var nurPost = hoch && l.every(function (u) { return u.post || upArt(u) !== 'ok'; });
      z.kopf = nurPost ? 'Bei den Unterlagen abgelegt' : hoch === 1 ? 'Hochgeladen und gelesen' : hoch + ' Belege hochgeladen und gelesen';
      if (n.pruefen) z.kopf += ' · ' + n.pruefen + ' bitte ansehen';
      var ok1 = l.filter(function (u) { return upArt(u) === 'ok'; });
      if (hoch === 1 && ok1.length === 1) z.sub = ok1[0].text || '';
      else if (!n.pruefen && hoch > 1) z.sub = auto === hoch ? 'Alle automatisch bestätigt.' : auto ? auto + ' automatisch bestätigt, ' + (hoch - auto) + ' bitte prüfen und bestätigen.' : 'Bitte prüfen und bestätigen.';
    }
    return z;
  }
  APP.upLeiste = function () {
    var box = APP.toastBox(); if (!box) return;
    var el = box.querySelector('.t.up'), l = S.upPanel;
    if (!l.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.setAttribute('role', 'status'); box.appendChild(el); }
    var z = upZusammen();
    el.className = 't up ' + z.art;
    var probleme = z.art === 'run' ? [] : l.filter(function (u) { return upArt(u) !== 'ok'; });
    var zeilen = probleme.slice(0, 4).map(function (u) {
      var t = '<b>' + h(u.name) + '</b>: ' + h(u.text || '');
      return '<li>' + (u.ziel ? '<button type="button" class="tl" data-act="doppelt-zeigen" data-g="' + h(u.gruppe || '') + '" data-ziel="' + h(u.ziel) + '">' + t + ' · ansehen</button>' : u.gruppe ? '<button type="button" class="tl" data-act="beleg" data-g="' + h(u.gruppe) + '">' + t + '</button>' : t) + '</li>';
    }).join('') + (probleme.length > 4 ? '<li>und ' + (probleme.length - 4) + ' weitere</li>' : '');
    el.innerHTML = (z.art === 'run' ? '<span class="spin" aria-hidden="true"></span>' : '<span class="ti" aria-hidden="true">' + (z.art === 'ok' ? '✓' : '!') + '</span>') +
      '<div class="tx"><b>' + h(z.kopf) + '</b>' + (z.sub ? '<span class="s">' + h(z.sub) + '</span>' : '') + (zeilen ? '<ul>' + zeilen + '</ul>' : '') + '</div>' +
      (z.art === 'run' ? '' : '<div class="knoepfe"><button type="button" class="tu" data-act="up-ansehen">Ansehen</button><button type="button" class="tz" data-act="up-zu" aria-label="Schließen">×</button></div>');
  };
  function upFertig() {
    if (S.upPanel.some(function (u) { return upArt(u) === 'laeuft'; })) { APP.upLeiste(); return; }
    APP.upLeiste();
    var z = upZusammen();
    clearTimeout(upTimer);
    if (z.art === 'ok') upTimer = setTimeout(function () { S.upPanel = []; APP.upLeiste(); }, 9000);
    try { if (navigator.vibrate) navigator.vibrate(z.art === 'ok' ? 40 : [90, 60, 90]); } catch (e) { /* egal */ }
    /* App im Hintergrund (z. B. am Handy weggewechselt): Mitteilung, wenn sie erlaubt ist */
    try {
      if (document.hidden && window.Notification && Notification.permission === 'granted' && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then(function (reg) {
          return reg.showNotification('S1 Tax · ' + z.kopf, { body: z.sub || '', tag: 's1tax-upload', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: location.href.split('#')[0] + '#' + upZiel() } });
        }).catch(function () {});
      }
    } catch (e) { /* egal */ }
  }
  function upZiel() {
    var l = S.upPanel, mit = l.filter(function (u) { return u.jahr && u.monat; })[0], post = l.filter(function (u) { return u.post; })[0];
    if (mit) return 'monat/' + mit.jahr + '-' + mit.monat;
    if (post) return 'steuer';
    return 'monat';
  }
  APP.A['up-zu'] = function () { clearTimeout(upTimer); S.upPanel = []; APP.upLeiste(); };
  APP.A['up-ansehen'] = function () {
    var l = S.upPanel, ziel = upZiel(), nur = l.length === 1 && l[0].gruppe ? l[0].gruppe : null;
    clearTimeout(upTimer); S.upPanel = []; APP.upLeiste();
    if (nur) { APP.belegDialog(nur); return; }
    APP.schliessen(); APP.go(ziel);
  };
  /* Seite nicht schließen, solange noch etwas hochlädt */
  window.addEventListener('beforeunload', function (e) {
    if (!S.upPanel.some(function (u) { return upArt(u) === 'laeuft'; })) return;
    e.preventDefault(); e.returnValue = 'Es wird noch hochgeladen.'; return e.returnValue;
  });
  APP.upNeu = upNeu; APP.upStart = upStart; APP.upErgebnis = upErgebnis; APP.upFehler = upFehler; APP.upFertig = upFertig;

  function hochladen(files, opt) {
    var x = APP.jm(S.view === 'monat' ? S.arg : '');
    var ziel = opt.heute ? { jahr: +L.heute().slice(0, 4), monat: +L.heute().slice(5, 7) } : x;
    var alle = files.length;
    files = files.filter(function (f) { return /pdf|image/.test(f.type) || /\.(pdf|jpe?g|png|heic|webp)$/i.test(f.name); });
    if (!files.length) { APP.toast(alle === 1 ? 'Nicht hochgeladen: Das ist kein PDF und kein Foto.' : 'Nicht hochgeladen: Bitte PDF-Dateien oder Fotos verwenden.', { bad: true }); return Promise.resolve([]); }
    if (files.length < alle) APP.toast(upZahl(alle - files.length, 'Datei', 'Dateien') + ' übersprungen: nur PDFs und Fotos gehen.', { warn: true });
    var eintraege = files.map(function (f) { return upNeu(anzeigeName(f, opt)); });
    upStart(eintraege);
    APP.render();
    return files.reduce(function (p, f, i) {
      return p.then(function () {
        var u = eintraege[i];
        var schritt = function (t) { u.text = t; APP.upLeiste(); APP.render(); };
        return APP.belegAnlegen(f, Object.assign({ jahr: ziel.jahr, monat: ziel.monat }, opt, { schritt: schritt }))
          .then(function (r) { upErgebnis(u, r); return r; })
          .catch(function (e) { upFehler(u, e); })
          .then(function () { APP.upLeiste(); APP.render(); });
      });
    }, Promise.resolve()).then(function () { APP.render(); upFertig(); return eintraege; });
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
      (zs ? APP.zuschneiden(f).catch(function () { return { datei: f }; }) : Promise.resolve({ datei: f })).then(function (z) {
        if (platz) { var ix = S.uploads.indexOf(platz); if (ix >= 0) S.uploads.splice(ix, 1); }
        return hochladen([z.datei], { quelle: 'scan', zahlung: 'bar', heute: S.view !== 'monat' }).then(function () {
          var u = S.uploads[0];
          if (u && u.gruppe && z.zugeschnitten) { S.zuschnitt = S.zuschnitt || {}; S.zuschnitt[u.gruppe] = z.original; }
          if (u && u.gruppe) APP.belegDialog(u.gruppe, { nachScan: true });
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
        else APP.toast('Beim Teilen ist keine Datei angekommen. Bitte noch einmal teilen.', { bad: true });
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
  /* Bewirtung: mit wem und Anlass (für die Steuer nötig). Sichtbar bei Konto 7652 oder einem Lokal als Lieferant */
  var LOKAL = /(restaurant|ristorante|restaurante|gasthaus|gasthof|wirt\b|stadtwirt|heuriger|beisl|cafe|café|caffè|bistro|bar\b|sportsbar|pizz|trattoria|osteria|taverne|bräu|stube|mesón|cervecer|brasserie|kantine|zimmerservice)/i;
  function istBewirtung(lieferant, konten) {
    if (konten.some(function (k) { return Number(k) === 7652; })) return true;
    return !konten.some(function (k) { return k; }) && LOKAL.test(lieferant || '');
  }
  APP.istBewirtung = istBewirtung;
  function bewirtungBlock(g, rows) {
    var bw = (rows.map(function (b) { return b.bewirtung; }).filter(Boolean)[0]) || {};
    var an = istBewirtung(g.lieferant, rows.filter(function (b) { return !b.storniert && b.status !== 'privat'; }).map(function (b) { return b.konto; }));
    var mit = {}, anlass = {};
    D.belege.slice().sort(function (a, b) { return String(b.datum || '').localeCompare(String(a.datum || '')); }).forEach(function (b) {
      if (b.bewirtung && b.bewirtung.mit) mit[b.bewirtung.mit] = 1;
      if (b.bewirtung && b.bewirtung.anlass) anlass[b.bewirtung.anlass] = 1;
    });
    var liste = function (id, o) { return '<datalist id="' + id + '">' + Object.keys(o).slice(0, 40).map(function (x) { return '<option value="' + h(x) + '">'; }).join('') + '</datalist>'; };
    return '<div id="bewirtung" class="bewirtung"' + (an ? '' : ' hidden') + '><div class="grid g2">' +
      '<label class="f">Bewirtung: mit wem<input class="in" name="bew_mit" list="bew-mit" autocomplete="off" placeholder="Name, Firma (z. B. Andreas Ubl, IFMS)" value="' + h(bw.mit || '') + '"></label>' +
      '<label class="f">Anlass<input class="in" name="bew_anlass" list="bew-anlass" autocomplete="off" placeholder="z. B. Projektbesprechung" value="' + h(bw.anlass || '') + '"></label>' +
      '</div><span class="s">Für die Steuer nötig: wer bewirtet wurde und der geschäftliche Anlass.</span>' + liste('bew-mit', mit) + liste('bew-anlass', anlass) + '</div>';
  }
  function bewirtungZeigen() {
    var box = document.getElementById('bewirtung'); if (!box) return;
    var form = document.getElementById('beleg-form'), d = document.getElementById('dlg');
    var konten = APP.$$('#zeilen [name="konto"]').map(function (x) { return x.value; });
    var lf = form && form.querySelector('[name="lieferant"]');
    var privat = d && d._beleg && d._beleg.status === 'privat';
    box.hidden = privat || !(istBewirtung(lf ? lf.value : '', konten) || box.querySelector('[name="bew_mit"]').value);
  }
  document.addEventListener('input', function (e) { if (e.target.closest('#beleg-form') && /^(konto|lieferant)$/.test(e.target.name)) bewirtungZeigen(); });
  document.addEventListener('click', function (e) { if (e.target.closest('#dlg [data-seg="status"] button')) setTimeout(bewirtungZeigen, 0); });
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
    var ds = L.dateien(g);
    var tabs = ds.length > 1 ? '<div class="seg seiten" role="group" aria-label="Seiten" id="seiten-tabs">' + ds.map(function (p, i) { return '<button type="button" data-act="seite-zeigen" data-p="' + h(p) + '" data-i="' + i + '" aria-pressed="' + (i === 0) + '">Seite ' + (i + 1) + '</button>'; }).join('') + '</div>' : '';
    return tabs + '<div id="vorschau-box">' + platzhalter() + '</div>' +
      '<div class="chips"><button type="button" class="btn small" id="vorschau-oeffnen" data-act="datei-oeffnen" data-p="' + h(g.datei) + '">In neuem Fenster öffnen</button>' +
      (!g.storniert ? '<button type="button" class="btn small" data-act="seite-neu" data-g="' + g.gruppe + '">+ Seite hinzufügen</button>' : '') +
      (ds.length > 1 ? '<button type="button" class="btn small ghost" id="seite-weg" data-act="seite-weg" data-g="' + g.gruppe + '" data-p="' + h(g.datei) + '" hidden>Diese Seite entfernen</button>' : '') +
      '<button type="button" class="btn small ghost" id="seite-ersetzen" data-act="datei-ersetzen" data-g="' + g.gruppe + '">' + (ds.length > 1 ? 'Seite 1 ersetzen' : 'Datei ersetzen') + '</button>' +
      (!g.nr && !g.storniert ? '<button type="button" class="btn small ghost" data-act="als-seite" data-g="' + g.gruppe + '">Gehört zu einem anderen Beleg</button>' : '') +
      (!g.nr ? '<button type="button" class="btn small ghost" data-act="als-post" data-g="' + g.gruppe + '">Kein Beleg (Post vom Amt)</button>' : '') + '</div>';
  }
  function platzhalter() { return '<div class="vorschau-datei" style="display:flex;align-items:center;justify-content:center"><span class="spin"></span></div>'; }
  /* eine Seite in der Vorschau zeigen */
  function vorschauLaden(p) {
    var box = document.getElementById('vorschau-box'); if (!box || !p) return;
    box.dataset.p = p; box.innerHTML = platzhalter();
    APP.dateiUrl('belege', p).then(function (u) {
      var b = document.getElementById('vorschau-box'); if (!b || b.dataset.p !== p) return;
      var img = /\.(jpe?g|png|webp|heic)$/i.test(p);
      b.innerHTML = img ? '<img class="vorschau-datei" src="' + h(u) + '" alt="Beleg">' : '<iframe class="vorschau-datei" src="' + h(u) + '#view=FitH" title="Beleg"></iframe>';
    }, function () { var b = document.getElementById('vorschau-box'); if (b) b.innerHTML = '<div class="vorschau-datei" style="display:flex;align-items:center;justify-content:center"><span class="mut">Vorschau nicht verfügbar</span></div>'; });
  }
  APP.A['seite-zeigen'] = function (el) {
    var p = el.dataset.p, i = +el.dataset.i;
    APP.$$('#seiten-tabs button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === el)); });
    var o = document.getElementById('vorschau-oeffnen'); if (o) o.dataset.p = p;
    var w = document.getElementById('seite-weg'); if (w) { w.dataset.p = p; w.hidden = i === 0; }
    var r = document.getElementById('seite-ersetzen'); if (r) r.hidden = i > 0;
    vorschauLaden(p);
  };
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
    if (!l || !l.ki) return zurueckNote(g) + pruefNote(g) + autoNote + bisher;
    var k = l.ki, t = [];
    if (k.begruendung) t.push(h(k.begruendung));
    if (k.regel) t.push('<b>Regel:</b> ' + h(k.regel));
    var fremd = k.an_s1 === false && !g.storniert && !l.an_s1_ok && g.bestaetigt === false;
    if (k.frage && !fremd) t.push('<b>Frage der App:</b> ' + h(k.frage));
    var fremdNote = fremd ? '<div class="note warn"><b>Diese Rechnung geht an ' + h(k.empfaenger || 'jemand anderen') + ', nicht an S1 Secure oder Jürgen Schandl.</b> Sie zählt deshalb vorerst nirgends mit.' +
      '<div class="chips" style="margin-top:8px"><button type="button" class="btn small danger" data-act="fremd-weg" data-g="' + g.gruppe + '">Falsch hineingezogen, entfernen</button><button type="button" class="btn small" data-act="fremd-ok" data-g="' + g.gruppe + '">Gehört doch zu S1 Secure</button></div></div>' : '';
    var dg = k.doppelt_gruppe && L.gruppen(D.belege, function (b) { return b.gruppe === k.doppelt_gruppe; })[0];
    var doppel = '';
    if (k.doppelt && g.bestaetigt === false && !g.storniert) {
      doppel = '<div class="note warn"><b>Diesen Beleg gibt es vermutlich schon:</b> ' + h(k.doppelt) + '. Er zählt deshalb vorerst nirgends mit.' +
        (dg ? '<div class="s" style="margin-top:6px">Ist es eine weitere Seite davon (z. B. Auftrag, Lieferschein, Anzahlung), häng es als Seite an.</div><div class="chips" style="margin-top:8px"><button type="button" class="btn small pri" data-act="doppelt-seite" data-g="' + g.gruppe + '" data-ziel="' + dg.gruppe + '">Als Seite ' + (L.dateien(dg).length + 1) + ' an ' + (L.belegNr(dg) ? 'Beleg ' + L.belegNr(dg) : 'den bestehenden Beleg') + ' anhängen</button><button type="button" class="btn small" data-act="doppelt-anhaengen" data-g="' + g.gruppe + '" data-ziel="' + dg.gruppe + '">Datei dort ersetzen</button><button type="button" class="btn small" data-act="doppelt-zeigen" data-g="' + g.gruppe + '" data-ziel="' + dg.gruppe + '">Bestehenden Beleg ansehen</button><button type="button" class="btn small ghost" data-act="doppelt-nein" data-g="' + g.gruppe + '">Ist kein Doppel</button></div>' : '') + '</div>';
    }
    var anz = k.anzahlung && L.n(k.anzahlung.betrag) > 0 && !g.storniert ? k.anzahlung : null, anzNote = '';
    if (anz && !L.barAnteil(g)) {
      var ab = L.r2(L.n(anz.betrag)), wie = anz.art === 'bar' ? ' (bar)' : anz.art === 'karte' ? ' (mit Karte)' : anz.art === 'ueberweisung' ? ' (überwiesen)' : '';
      anzNote = '<div class="note yel"><b>Auf dem Beleg steht eine Anzahlung von ' + L.eur(ab) + wie + '.</b> War sie bar, erwartet die App vom Konto nur ' + L.eur(L.r2(g.brutto - ab)) + '.' +
        (ab < g.brutto ? '<div class="chips" style="margin-top:8px"><button type="button" class="btn small pri" data-act="anzahlung-bar" data-g="' + g.gruppe + '" data-b="' + ab + '">Ja, ' + L.eur(ab) + ' bar angezahlt</button></div>' : '') + '</div>';
    }
    return zurueckNote(g) + pruefNote(g) + autoNote + fremdNote + anzNote + (t.length ? '<div class="note blue"><b>Von der App gelesen.</b> ' + t.join(' ') + '</div>' : '') + bisher + doppel;
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
      (!neu ? neueSeiteNote(g) + lesungHinweis(g) : '') +
      (!g.storniert ? bewirtungBlock(g, rows) : '') +
      '<div class="cols"><div class="narrow" style="flex-basis:340px">' + (neu ? '<div class="note">Für Belege ohne Datei, z. B. wenn der Kontoauszug als Beleg reicht. Foto oder PDF kannst du danach hinzufügen.</div>' : dateiVorschau(g)) +
      (!neu && L.barAnteil(g) ? '<div class="note blue" style="margin-top:8px"><b>' + L.eur(L.barAnteil(g)) + ' bar angezahlt</b>, ' + L.eur(L.bankSoll(g)) + ' über das Konto.</div>' : '') +
      (bk ? '<div class="note ok" style="margin-top:8px">Mit dem Konto verbunden: ' + L.datum(bk.datum) + ' · ' + h(bk.name) + ' · ' + L.eur(bk.betrag) + '</div>' : (!neu && g.zahlung === 'bank' ? (L.wartend(D)[g.gruppe] ? '<div class="note yel" style="margin-top:8px"><b>Noch nicht bezahlt</b> (Kontoauszug bis ' + L.datum(L.bankBis(D)) + '). Die Rechnung zählt erst im Monat der Zahlung, für Vorsteuer und Ausgabe. Beim Monatsabschluss kommt sie in den nächsten Monat, die Zahlung ordnet die App dann selbst zu.</div>' : '<div class="note" style="margin-top:8px">Noch keiner Bankbuchung zugeordnet. Zahlst du später, kommt die Rechnung automatisch in den Monat der Zahlung.</div>') : '')) +
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
      '<label class="f bar-anteil" id="bar-anteil-f"' + (g.zahlung === 'bar' ? ' hidden' : '') + ' title="Wenn ein Teil bar bezahlt wurde, z. B. eine Anzahlung: vom Konto erwartet die App dann nur den Rest">davon bar<input class="in" name="bar_anteil" inputmode="decimal" placeholder="0,00" value="' + (g.bar_anteil ? h(L.fmt(g.bar_anteil)) : '') + '"></label>' +
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
    if (g.datei) vorschauLaden(g.datei);
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('#dlg [data-seg] button'); if (!b) return;
    var seg = b.parentNode, d = document.getElementById('dlg');
    APP.$$('button', seg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    if (d._beleg) d._beleg[seg.dataset.seg] = b.dataset.v;
    if (seg.dataset.seg === 'zahlung') { var ba = document.getElementById('bar-anteil-f'); if (ba) ba.hidden = b.dataset.v === 'bar'; }
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
    var summeZ = L.r2(zeilen.reduce(function (n, z) { return n + (isFinite(z.brutto) ? z.brutto : 0); }, 0));
    var bar = st.zahlung === 'bank' && String(v.bar_anteil || '').trim() ? L.parse(v.bar_anteil) : 0;
    if (!fehler && (!isFinite(bar) || bar < 0)) fehler = 'Bitte bei „davon bar“ einen Betrag eintragen, z. B. 100,00.';
    else if (!fehler && bar && bar >= summeZ) fehler = 'Der Baranteil muss kleiner sein als der Beleg (' + L.eur(summeZ) + '). Ist alles bar bezahlt, bitte „Bar“ wählen.';
    if (fehler) { APP.toast(fehler, { bad: true }); return; }
    var gemeinsam = { datum: datum, lieferant: v.lieferant.trim(), zahlung: st.zahlung, status: st.status, jahr: jahr, monat: monat, rechnungsnr: v.rechnungsnr || null, notiz: v.notiz || null, anlage: !!v.anlage, garantie_bis: v.garantie_bis || null, bestaetigt: true, bar_anteil: bar > 0 ? L.r2(bar) : null };
    if (!v.anlage && st.status !== 'privat' && zeilen.some(function (z) { return z.netto > 1000 && Number(z.konto) >= 4000; })) APP.toast('Hinweis: über 1.000 € netto – wenn es ein Gerät ist, als Anlagegut markieren.');
    var bwBox = document.getElementById('bewirtung'), bwAn = bwBox && !bwBox.hidden;
    var bwWert = function (n) { var x = bwBox && bwBox.querySelector('[name="' + n + '"]'); return x ? x.value.trim() : ''; };
    var bwMit = bwWert('bew_mit'), bwAnlass = bwWert('bew_anlass');
    if (bwAn) gemeinsam.bewirtung = bwMit || bwAnlass ? { mit: bwMit || null, anlass: bwAnlass || null, am: L.heute(), von: APP.ich() } : null;
    var bwFehlt = bwAn && !bwMit && st.status !== 'privat' && zeilen.some(function (z) { return Number(z.konto) === 7652 && !z.privat; });
    var verdacht = st.g && st.g.rows.some(L.doppelVerdacht);
    (bwFehlt ? APP.bestaetigen('Bei einer Bewirtung will das Finanzamt wissen, wer bewirtet wurde und warum. Ohne Angabe speichern?', 'Ohne Angabe speichern') : Promise.resolve(true)).then(function (ok0) {
    if (!ok0) return false;
    return verdacht ? APP.bestaetigen('Die App hält diesen Beleg für ein Doppel eines bestehenden Belegs. Wenn du ihn trotzdem bestätigst, zählt er zusätzlich mit (Vorsteuer, Excel für CNC). Wirklich als eigenen Beleg speichern?', 'Ja, eigener Beleg') : true;
    }).then(function (ok) {
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
        else jobs.push(APP.ins('belege', [Object.assign(row, { gruppe: gruppe, quelle: st.g ? (st.g.quelle || 'manuell') : 'manuell', datei: st.g ? st.g.datei : null, seiten: st.g && st.g.seiten.length ? st.g.seiten : null })]));
      });
      alt.forEach(function (b) { if (!zeilen.some(function (z) { return z.id === b.id; })) jobs.push(APP.upd('belege', { id: b.id }, { storniert: true })); });
      return Promise.all(jobs).then(function () {
        if (st.bank) return APP.upd('bank', { id: st.bank.id }, { art: 'beleg', beleg_gruppe: gruppe });
      }).then(function () {
        APP.schliessen(); APP.ok('Gespeichert.'); APP.render();
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
      }).then(function () { APP.schliessen(); APP.ok(zur ? 'Wiederhergestellt.' : 'Storniert: ' + grund); APP.render(); });
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
    if (S.neueSeite) delete S.neueSeite[g];
    APP.lauf(el, function () {
      return APP.belegLesen(row).then(function (r) {
        if (r.abgelegt) { APP.schliessen(); APP.toast(postText(r.r)); APP.render(); return; }
        if (r.leseFehler) APP.toast(r.leseFehler, { bad: true }); else APP.ok('Neu gelesen.'); APP.belegDialog(g); APP.render();
      });
    });
  };
  /* Verdacht auf Doppel: bestehenden Beleg direkt zeigen, mit Weg zurück zum neuen */
  function zurueckNote(g) {
    var von = S.doppelVon;
    if (!von || von.ziel !== g.gruppe || !von.g) return '';
    var n = L.gruppen(D.belege, function (b) { return b.gruppe === von.g; })[0];
    if (!n) return '';
    return '<div class="note blue"><b>Das ist der bestehende Beleg.</b> Der neue: ' + h(n.lieferant || 'ohne Namen') + (n.datum ? ' vom ' + L.datum(n.datum) : '') + ' über ' + L.eur(n.brutto) + '.' +
      '<div class="chips" style="margin-top:8px"><button type="button" class="btn small" data-act="beleg" data-g="' + von.g + '">Zurück zum neuen Beleg</button></div></div>';
  }
  APP.A['doppelt-zeigen'] = function (el) {
    var ziel = el.dataset.ziel;
    if (!D.belege.some(function (b) { return b.gruppe === ziel; })) { APP.toast('Den bestehenden Beleg finde ich nicht mehr.', { bad: true }); return; }
    S.doppelVon = { g: el.dataset.g || null, ziel: ziel };
    APP.belegDialog(ziel);
  };
  /* Rechnung an jemand anderen: entfernen (storniert und ausgeblendet) oder doch für S1 Secure */
  function fremdFragenErledigen(rows, antwort) {
    var ids = rows.map(function (b) { return b.id; });
    var offen = D.fragen.filter(function (f) { return !f.erledigt && ids.indexOf(f.datensatz) >= 0; });
    return Promise.all(offen.map(function (f) { return APP.upd('fragen', { id: f.id }, { erledigt: true, antwort: antwort, antwort_von: APP.ich(), antwort_am: new Date().toISOString() }); }));
  }
  APP.A['fremd-weg'] = function (el) {
    var g = el.dataset.g, rows = D.belege.filter(function (b) { return b.gruppe === g && !b.storniert; });
    var k = (rows[0] && rows[0].lesung && rows[0].lesung.ki) || {}, an = k.empfaenger || 'jemand anderen';
    APP.lauf(el, function () {
      return Promise.all(rows.map(function (b) {
        return APP.upd('belege', { id: b.id }, { storniert: true, notiz: 'Storniert: Gehört nicht zu S1 Secure (an ' + an + ')', lesung: Object.assign({}, b.lesung || {}, { weg: { grund: 'nicht an S1 Secure', am: new Date().toISOString(), von: APP.ich() } }) });
      })).then(function () { return fremdFragenErledigen(rows, 'Falsch hineingezogen, entfernt.'); }).then(function () {
        D.belege = D.belege.filter(function (b) { return b.gruppe !== g; });
        S.uploads.forEach(function (u) { if (u.gruppe === g) { u.gruppe = null; u.status = 'fertig'; u.art = 'ok'; u.ziel = null; u.text = 'entfernt (nicht an S1 Secure)'; } }); APP.upLeiste();
        APP.schliessen(); APP.toast('Entfernt. Die Rechnung an ' + an + ' zählt nirgends mit.'); APP.render();
      });
    });
  };
  APP.A['fremd-ok'] = function (el) {
    var g = el.dataset.g, rows = D.belege.filter(function (b) { return b.gruppe === g && !b.storniert; });
    APP.lauf(el, function () {
      return Promise.all(rows.map(function (b) {
        return APP.upd('belege', { id: b.id }, Object.assign({ lesung: Object.assign({}, b.lesung || {}, { an_s1_ok: { am: new Date().toISOString(), von: APP.ich() } }) }, b.status === 'unklar' ? { status: 'geschaeftlich' } : {}));
      })).then(function () { return fremdFragenErledigen(rows, 'Gehört zu S1 Secure.'); }).then(function () {
        APP.toast('Passt. Bitte noch prüfen und bestätigen.'); APP.belegDialog(g); APP.render();
      });
    });
  };
  function postText(r) {
    var u = r && r.unterlage || {};
    if (r && r.schon) return 'Dieses Schreiben ist schon bei den Unterlagen ' + u.jahr + ' abgelegt (' + (u.stelle || '') + ' – ' + (u.titel || '') + '). Nichts doppelt.';
    return 'Post von ' + (u.stelle || 'Behörde') + ' bei den Unterlagen ' + u.jahr + ' abgelegt' + (r && r.geaendert && r.geaendert.length ? '. Übernommen: ' + r.geaendert.join(', ') : '') + '.';
  }
  APP.postText = postText;
  APP.A['als-post'] = function (el) {
    var g = el.dataset.g;
    APP.bestaetigen('Das ist kein Beleg, sondern Post vom Amt (z. B. Bescheid oder Benachrichtigung)? Die Datei kommt zu den Unterlagen, der Beleg verschwindet.', 'Als Post ablegen').then(function (ok) {
      if (!ok) return;
      return APP.alsPostAblegen(g).then(function (u) { APP.schliessen(); APP.ok('Bei den Unterlagen ' + u.jahr + ' abgelegt.'); APP.render(); });
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
      APP.ok('Datei gespeichert. Die alte Datei bleibt im Archiv.');
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
          /* der doppelte Eintrag wird storniert und ausgeblendet, damit er nicht durchgestrichen in der Liste steht */
          return Promise.all(neu.map(function (b) { return APP.upd('belege', { id: b.id }, { storniert: true, notiz: 'Doppelt: Datei an ' + name + ' angehängt', lesung: Object.assign({}, b.lesung || {}, { weg: { grund: 'doppelt', am: new Date().toISOString(), von: APP.ich() } }) }); }));
        }).then(function () { D.belege = D.belege.filter(function (b) { return b.gruppe !== el.dataset.g; }); APP.toast('Datei an ' + name + ' angehängt, der doppelte Eintrag ist storniert.'); APP.belegDialog(zg.gruppe); APP.render(); });
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

  /* ---------- weitere Seiten: Auftrag, Lieferschein, Anzahlung, Rückseite ---------- */
  function gruppeRows(gr) { return D.belege.filter(function (b) { return b.gruppe === gr; }); }
  function gruppeVon(gr) { return L.gruppen(D.belege, function (b) { return b.gruppe === gr; })[0]; }
  function endung(blob) { var t = blob.type || ''; return /pdf/.test(t) ? 'pdf' : /png/.test(t) ? 'png' : /webp/.test(t) ? 'webp' : 'jpg'; }
  function neueSeiteNote(g) {
    var n = S.neueSeite && S.neueSeite[g.gruppe];
    if (!n || g.storniert) return '';
    return '<div class="note blue"><b>' + h(n) + '</b> Stehen darauf Beträge oder eine Anzahlung, lass die App alle Seiten zusammen neu lesen.' +
      '<div class="chips" style="margin-top:8px"><button type="button" class="btn small pri" data-act="beleg-lesen" data-g="' + g.gruppe + '">Alle Seiten neu lesen</button></div></div>';
  }
  APP.A['seite-neu'] = function (el) { var i = document.getElementById('f-seite'); i.value = ''; i.dataset.g = el.dataset.g; i.click(); };
  document.addEventListener('change', function (e) {
    if (e.target.id !== 'f-seite' || !e.target.files.length) return;
    var gr = e.target.dataset.g, files = Array.prototype.slice.call(e.target.files), g = gruppeVon(gr);
    if (!g) return;
    var pfade = [], hashes = [];
    APP.toast(files.length > 1 ? files.length + ' Seiten werden hochgeladen …' : 'Seite wird hochgeladen …', { ms: 3000 });
    files.reduce(function (p, f) {
      return p.then(function () {
        /* Fotos wie beim Scannen zuschneiden; klappt das nicht, das ganze Foto */
        return /^image\//.test(f.type || '') && APP.zuschneiden && APP.zuschnittAn() ? APP.zuschneiden(f).then(function (z) { return z.datei; }, function () { return f; }) : f;
      }).then(APP.bildVerkleinern).then(function (blob) {
        var path = g.jahr + '/' + L.p2(g.monat) + '/' + APP.uuid() + '.' + endung(blob);
        return (APP.sha256 ? APP.sha256(blob) : Promise.resolve(null)).then(function (hx) {
          if (hx && D.belege.some(function (b) { return !b.storniert && b.lesung && (b.lesung.hash === hx || (b.lesung.seiten_hash || []).indexOf(hx) >= 0); })) throw new Error('Diese Datei ist schon in der App (als Beleg oder Seite).');
          if (hx) hashes.push(hx);
          return APP.hochladen('belege', path, blob);
        }).then(function () { pfade.push(path); });
      });
    }, Promise.resolve()).then(function () {
      var seiten = g.datei ? g.seiten.concat(pfade) : pfade.slice(1);
      return Promise.all(gruppeRows(gr).map(function (b) {
        var l = Object.assign({}, b.lesung || {}); l.seiten_hash = (l.seiten_hash || []).concat(hashes);
        var patch = { seiten: seiten.length ? seiten : null, lesung: l };
        if (!g.datei) patch.datei = pfade[0];
        return APP.upd('belege', { id: b.id }, patch);
      }));
    }).then(function () {
      var n = L.dateien(gruppeVon(gr)).length;
      S.neueSeite = S.neueSeite || {}; S.neueSeite[gr] = (pfade.length > 1 ? pfade.length + ' Seiten angehängt' : 'Seite ' + n + ' angehängt') + ', der Beleg hat jetzt ' + n + (n === 1 ? ' Seite.' : ' Seiten.');
      APP.ok(pfade.length > 1 ? pfade.length + ' Seiten angehängt.' : 'Seite ' + n + ' angehängt.');
      APP.belegDialog(gr); APP.render();
    }).catch(function (e) {
      if (pfade.length) APP.toast('Nur ' + pfade.length + ' von ' + files.length + ' Seiten hochgeladen, nichts angehängt.', { warn: true });
      APP.fehler(e, 'Seite');
    });
  });
  APP.A['seite-weg'] = function (el) {
    var gr = el.dataset.g, p = el.dataset.p, g = gruppeVon(gr);
    if (!g || !p || p === g.datei) return;
    APP.bestaetigen('Diese Seite vom Beleg entfernen? Die Datei bleibt im Archiv.', 'Entfernen').then(function (ok) {
      if (!ok) { APP.belegDialog(gr); return; }
      var rest = g.seiten.filter(function (x) { return x !== p; });
      return Promise.all(gruppeRows(gr).map(function (b) { return APP.upd('belege', { id: b.id }, { seiten: rest.length ? rest : null }); }))
        .then(function () { APP.ok('Seite entfernt.'); APP.belegDialog(gr); APP.render(); });
    }).catch(APP.fehler);
  };
  /* einen eigenen Eintrag als weitere Seite an einen anderen Beleg hängen; der Eintrag wird storniert und ausgeblendet */
  function alsSeiteAnhaengen(srcG, zielG) {
    var src = gruppeVon(srcG), zg = gruppeVon(zielG);
    if (!src || !zg || srcG === zielG) return Promise.reject(new Error('Beleg nicht gefunden.'));
    var vorhanden = L.dateien(zg), neu = L.dateien(src).filter(function (p) { return vorhanden.indexOf(p) < 0; });
    if (!neu.length) return Promise.reject(new Error('Der Eintrag hat keine Datei.'));
    var name = L.belegNr(zg) ? 'Beleg ' + L.belegNr(zg) : 'den Beleg ' + (zg.lieferant || '');
    var nr = vorhanden.length + 1, am = new Date().toISOString();
    var l0 = src.rows[0].lesung || {}, srcHash = [l0.hash].concat(l0.seiten_hash || []).filter(Boolean), srcKi = l0.ki || {};
    var datei = zg.datei || neu[0], seiten = zg.datei ? zg.seiten.concat(neu) : neu.slice(1);
    return Promise.all(gruppeRows(zielG).map(function (b) {
      var l = Object.assign({}, b.lesung || {});
      l.seiten_hash = (l.seiten_hash || []).concat(srcHash);
      if (srcKi.anzahlung && l.ki && !l.ki.anzahlung) l.ki = Object.assign({}, l.ki, { anzahlung: srcKi.anzahlung });
      var patch = { seiten: seiten.length ? seiten : null, lesung: l };
      if (!zg.datei) patch.datei = datei;
      return APP.upd('belege', { id: b.id }, patch);
    })).then(function () {
      /* war der Eintrag schon einer Abbuchung zugeordnet: die gehört jetzt zum Beleg */
      return Promise.all(D.bank.filter(function (x) { return x.beleg_gruppe === srcG; }).map(function (x) { return APP.upd('bank', { id: x.id }, { beleg_gruppe: zielG }); }));
    }).then(function () {
      return Promise.all(gruppeRows(srcG).filter(function (b) { return !b.storniert; }).map(function (b) {
        return APP.upd('belege', { id: b.id }, { storniert: true, notiz: 'Als Seite ' + nr + ' an ' + name + ' angehängt', lesung: Object.assign({}, b.lesung || {}, { weg: { grund: 'seite', ziel: zielG, am: am, von: APP.ich() } }) });
      }));
    }).then(function () {
      var ids = src.rows.map(function (b) { return b.id; });
      return Promise.all(D.fragen.filter(function (f) { return !f.erledigt && ids.indexOf(f.datensatz) >= 0; }).map(function (f) {
        return APP.upd('fragen', { id: f.id }, { erledigt: true, antwort: 'Als Seite an ' + name + ' angehängt', antwort_von: APP.ich(), antwort_am: am });
      }));
    }).then(function () {
      src.rows.forEach(function (b) { APP.merkeAusgeblendet(Object.assign({}, b, { lesung: Object.assign({}, b.lesung || {}, { weg: { grund: 'seite' } }) })); });
      D.belege = D.belege.filter(function (b) { return b.gruppe !== srcG; });
      S.neueSeite = S.neueSeite || {}; S.neueSeite[zielG] = 'Seite ' + nr + (neu.length > 1 ? '–' + (nr + neu.length - 1) : '') + ' angehängt (' + (src.lieferant || 'ohne Namen') + (src.datum ? ' vom ' + L.datum(src.datum) : '') + ').';
      return { name: name, nr: nr };
    });
  }
  APP.alsSeiteAnhaengen = alsSeiteAnhaengen;
  function anhaengenUndZeigen(el) {
    var ziel = el.dataset.ziel;
    return APP.lauf(el, function () {
      return alsSeiteAnhaengen(el.dataset.g, ziel).then(function (r) { APP.ok('Als Seite ' + r.nr + ' an ' + r.name + ' angehängt.'); APP.belegDialog(ziel); APP.render(); });
    });
  }
  APP.A['doppelt-seite'] = anhaengenUndZeigen;
  APP.A['als-seite-ziel'] = anhaengenUndZeigen;
  APP.A['als-seite'] = function (el) {
    var gr = el.dataset.g, g = gruppeVon(gr);
    if (!g) return;
    var kand = L.gruppen(D.belege, function (b) { return b.gruppe !== gr && !b.storniert; }).filter(function (x) {
      return !x.storniert && Math.abs((x.jahr * 12 + x.monat) - (g.jahr * 12 + g.monat)) <= 2;
    }).map(function (x) {
      var s0 = (g.lieferant && L.aehnlich(x.lieferant || '', g.lieferant) ? 100 : 0) + (Math.abs(x.brutto - g.brutto) < 0.02 ? 20 : 0) - (x.datum && g.datum ? Math.min(60, Math.abs(L.tageBis(x.datum, g.datum))) : 30);
      return { g: x, s: s0 };
    }).sort(function (a, b) { return b.s - a.s; }).slice(0, 12);
    APP.modal({
      title: 'Zu welchem Beleg gehört das?',
      body: '<p style="margin:0">Die Datei kommt als weitere Seite zum gewählten Beleg. Dieser Eintrag (' + h(g.lieferant || 'ohne Namen') + ', ' + L.eur(g.brutto) + ') wird danach storniert und zählt nicht doppelt.</p>' +
        (kand.length ? '<div class="list card flat" style="padding:0">' + kand.map(function (k) {
          return '<button type="button" class="item" data-act="als-seite-ziel" data-g="' + gr + '" data-ziel="' + k.g.gruppe + '"><div class="grow"><span class="t">' + h(k.g.lieferant || '(ohne Namen)') + '</span><span class="s">' + (L.belegNr(k.g) || 'neu') + ' · ' + L.datum(k.g.datum) + ' · ' + h(k.g.text || '') + (k.g.seiten.length ? ' · ' + (k.g.seiten.length + 1) + ' Seiten' : '') + '</span></div><span class="amt">' + L.eur(k.g.brutto) + '</span></button>';
        }).join('') + '</div>' : '<div class="s">Kein Beleg in den Monaten daneben.</div>'),
      foot: '<button type="button" class="btn" data-act="beleg" data-g="' + gr + '">Zurück</button>'
    });
  };
  APP.A['anzahlung-bar'] = function (el) {
    var gr = el.dataset.g, b = L.r2(+el.dataset.b);
    if (!(b > 0)) return;
    APP.lauf(el, function () {
      return Promise.all(gruppeRows(gr).map(function (x) { return APP.upd('belege', { id: x.id }, { zahlung: 'bank', bar_anteil: b }); }))
        .then(function () { APP.ok(L.eur(b) + ' bar eingetragen. Vom Konto erwartet die App jetzt nur den Rest.'); APP.belegDialog(gr); APP.render(); });
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
      }).then(function () { APP.ok('Frage gestellt. ' + (APP.ich() === 'j' ? 'Dagmar' : 'Jürgen') + ' bekommt eine Mitteilung.'); APP.fn('erinnerungen', {}, 'jetzt').catch(function () {}); if (row.gruppe) APP.belegDialog(row.gruppe); APP.render(); });
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
        APP.schliessen(); APP.ok('Antwort gespeichert.'); APP.fn('erinnerungen', {}, 'jetzt').catch(function () {}); APP.render();
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
    var wt = L.wartend(D), warten = L.gruppen(D.belege, function (b) { return b.jahr === j && b.monat === m && wt[b.gruppe]; });
    var ohneNr = L.gruppen(D.belege, function (b) { return b.jahr === j && b.monat === m && !b.storniert && b.status !== 'privat' && !b.nr && !wt[b.gruppe]; }).length;
    var bank = D.bank.filter(function (b) { return b.jahr === j && b.monat === m && b.art === 'offen'; }).length;
    var nj = m === 12 ? j + 1 : j, nm = m === 12 ? 1 : m + 1;
    var warn = [];
    if (!L.bankBis(D) || L.bankBis(D) < L.monatsEnde(j, m)) warn.push('der Kontoauszug ' + L.MONATE[m] + ' ist noch nicht eingelesen');
    if (neu) warn.push(neu + ' Beleg(e) noch nicht bestätigt');
    if (bank) warn.push(bank + ' Bankbuchung(en) ohne Beleg');
    if (!ohneNr && !warten.length) { APP.toast('Alle Belege in ' + L.MONATE[m] + ' haben schon eine Nummer.'); return; }
    var wtText = warten.length ? '<br><br><b>Noch nicht bezahlt:</b> ' + warten.map(function (g) { return h(g.lieferant || 'Rechnung') + ' ' + L.eur(g.brutto); }).join(', ') + '. ' + (warten.length === 1 ? 'Sie kommt' : 'Sie kommen') + ' in den Monat der Zahlung (vorerst ' + L.MONATE[nm] + ') und bekommt dort die Nummer.' : '';
    APP.bestaetigen((ohneNr ? ohneNr + ' Beleg(e) bekommen jetzt fortlaufende Nummern (zuerst nach Kontoauszug, dann Barbelege).' : 'Alle bezahlten Belege haben schon eine Nummer.') + wtText + (warn.length ? '<br><br><b>Noch offen:</b> ' + warn.join(', ') + '. Du kannst trotzdem abschließen; Nachträge bekommen später die nächste freie Nummer.' : ''), 'Abschließen').then(function (ok) {
      if (!ok) return;
      return APP.lauf(el, function () {
        return Promise.all(warten.map(function (g) { return APP.upd('belege', { gruppe: g.gruppe }, { jahr: nj, monat: nm }); })).then(function () {
          return APP.rpc('monat_abschliessen', { p_jahr: j, p_monat: m });
        }).then(function (n) { return APP.laden().then(function () { APP.ok(n + ' Belegnummern vergeben.'); APP.render(); }); });
      });
    });
  };
  APP.A['monat-geprueft'] = function (el) {
    var j = +el.dataset.j, m = +el.dataset.m, aus = !!el.dataset.aus;
    var patch = aus ? { jahr: j, monat: m, geprueft_am: null, geprueft_von: null } : { jahr: j, monat: m, geprueft_am: new Date().toISOString(), geprueft_von: APP.ich(), nach_pruefung_geaendert: false };
    APP.lauf(el, function () {
      var mo = L.monat(D, j, m);
      return (mo ? APP.upd('monate', { jahr: j, monat: m }, patch) : APP.ins('monate', [patch])).then(function () {
        APP.ok(aus ? 'Prüfung zurückgenommen.' : L.MONATE[m] + ' als geprüft markiert.'); APP.fn('erinnerungen', {}, 'jetzt').catch(function () {}); APP.render();
      });
    });
  };
  APP.A['monat-excel'] = function (el) {
    var j = +el.dataset.j, m = +el.dataset.m;
    APP.lauf(el, function () { return window.XLSXW.build(L.monatsExcel(D, j, m)).then(function (blob) { APP.speichernUnter(blob, L.monatsDatei(j, m)); }); });
  };
})();
