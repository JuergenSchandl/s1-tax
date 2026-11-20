/* S1 Tax · Grundgerüst
   Verbindung zur Datenbank, Datenstand, Navigation, Dialoge und Meldungen.
   Die einzelnen Bereiche (Belege, Bank, Steuer, Rechnungen …) hängen sich in APP.V ein. */
(function () {
  'use strict';
  var CFG = window.S1_CONFIG || {};
  var L = window.L;
  var APP = window.APP = {
    VERSION: '2026.11.21e',
    CFG: CFG,
    sb: null,
    D: { belege: [], bank: [], ausgang: [], kunden: [], monate: [], einst: {}, fragen: [], hinweise: {}, members: [] },
    S: { view: 'uebersicht', arg: '', me: null, online: navigator.onLine, geladen: false, laedt: false, q: '' },
    V: {}, A: {}
  };
  var D = APP.D, S = APP.S;

  /* ---------- kleine Helfer ---------- */
  APP.h = L.esc;
  APP.eur = L.eur;
  APP.dat = L.datum;
  APP.$ = function (sel, root) { return (root || document).querySelector(sel); };
  APP.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  APP.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  };
  var ICONS = {
    upload: '<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/>',
    kamera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    datei: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
    such: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    haus: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
    belege: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/>',
    mehr: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    pfeil: '<path d="M9 6l6 6-6 6"/>',
    zurueck: '<path d="M15 6l-6 6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    neu: '<path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4v5h-5"/>',
    excel: '<path d="M4 4h16v16H4z"/><path d="M8 8l8 8M16 8l-8 8"/>',
    frage: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14"/><path d="M12 17.5v.01"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
  };
  APP.icon = function (n, s) { return '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; };
  APP.ich = function () { return S.me ? S.me.person : null; };
  APP.istJ = function () { return APP.ich() === 'j'; };
  APP.name = function (p) { var m = D.members.find(function (x) { return x.person === p; }); return m ? m.name : p === 'j' ? 'Jürgen' : p === 'd' ? 'Dagmar' : p === 'app' ? 'App' : p || ''; };

  /* ---------- Meldungen ---------- */
  APP.toast = function (msg, opt) {
    opt = opt || {};
    var box = document.getElementById('toast'), t = document.createElement('div');
    t.className = 't' + (opt.bad ? ' bad' : '');
    t.innerHTML = '<span>' + APP.h(msg) + '</span>' + (opt.undo ? '<button type="button">Rückgängig</button>' : '');
    if (opt.undo) t.querySelector('button').onclick = function () { t.remove(); opt.undo(); };
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, opt.ms || (opt.undo ? 7000 : opt.bad ? 6000 : 3200));
  };
  APP.fehler = function (e, was) {
    var m = e && (e.message || e.msg || e.error_description || e.error) || String(e || 'Unbekannter Fehler');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) m = 'Keine Verbindung. Bitte Internet prüfen.';
    if (/JWT|session|not authenticated/i.test(m)) m = 'Die Anmeldung ist abgelaufen. Bitte neu anmelden.';
    if (window.console) console.error(was || 'Fehler', e);
    APP.toast((was ? was + ': ' : '') + m, { bad: true });
  };

  /* ---------- Dialoge ---------- */
  var dlg = function () { return document.getElementById('dlg'); };
  APP.modal = function (o) {
    var d = dlg();
    d.innerHTML = '<div class="dh"><h2>' + APP.h(o.title || '') + '</h2><button type="button" class="x" data-act="schliessen" aria-label="Schließen">×</button></div>' +
      '<div class="db">' + (o.body || '') + '</div>' + (o.foot ? '<div class="df">' + o.foot + '</div>' : '');
    d.style.width = o.wide ? 'min(1080px, calc(100vw - 24px))' : '';
    d._onClose = o.onClose || null;
    if (!d.open) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
    d.scrollTop = 0;
    var f = d.querySelector('[autofocus]'); if (f) setTimeout(function () { f.focus(); }, 30);
    return d;
  };
  APP.schliessen = function () { var d = dlg(); if (d.open) d.close(); };
  document.addEventListener('DOMContentLoaded', function () {
    dlg().addEventListener('close', function () { var d = dlg(), f = d._onClose; d._onClose = null; d.innerHTML = ''; if (f) f(); });
    dlg().addEventListener('click', function (e) { if (e.target === dlg()) APP.schliessen(); });
  });
  APP.bestaetigen = function (text, ok, opt) {
    opt = opt || {};
    return new Promise(function (res) {
      var done = false;
      APP.modal({
        title: opt.title || 'Bitte bestätigen', body: '<p style="margin:0">' + text + '</p>',
        foot: '<button type="button" class="btn" data-act="schliessen">Abbrechen</button><button type="button" class="btn ' + (opt.danger ? 'danger' : 'pri') + '" id="ok-btn">' + APP.h(ok || 'OK') + '</button>',
        onClose: function () { if (!done) res(false); }
      });
      document.getElementById('ok-btn').onclick = function () { done = true; APP.schliessen(); res(true); };
    });
  };
  /* Knopf sperren, solange etwas läuft */
  APP.lauf = function (btn, fn) {
    if (btn && btn.disabled) return Promise.resolve();
    var old = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> ' + (btn.dataset.busy || 'Bitte warten'); }
    return Promise.resolve().then(fn).catch(function (e) { APP.fehler(e); }).then(function (r) {
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; }
      return r;
    });
  };

  /* ---------- Datenbank ---------- */
  var KEYS = { belege: ['id'], bank: ['id'], ausgang: ['id'], kunden: ['id'], monate: ['jahr', 'monat'], fragen: ['id'], einstellungen: ['key'], hinweise: ['key'] };
  function zahlen(table, r) {
    if (!r) return r;
    ['netto', 'ust', 'brutto', 'steuersatz', 'betrag', 'bezahlt_betrag', 'uva_zahllast', 'uva_bezahlt'].forEach(function (k) { if (r[k] !== null && r[k] !== undefined && typeof r[k] === 'string') r[k] = Number(r[k]); });
    return r;
  }
  /* als Post vom Amt abgelegt oder falsch hineingezogen: bleibt storniert in der Datenbank, die App zeigt ihn nicht */
  APP.istPost = function (b) { return !!(b && b.storniert && b.lesung && (b.lesung.post || b.lesung.weg)); };
  /* Fingerabdrücke der ausgeblendeten Dateien: dieselbe Datei noch einmal hochladen wird erkannt */
  APP.ausgeblendet = {};
  APP.merkeAusgeblendet = function (b) {
    if (b && b.lesung && b.lesung.hash) APP.ausgeblendet[b.lesung.hash] = { post: !!b.lesung.post, grund: b.lesung.weg && b.lesung.weg.grund, datei: b.datei, lieferant: b.lieferant };
  };
  function merge(table, rows) {
    if (table === 'belege') { var weg = rows.filter(APP.istPost); weg.forEach(APP.merkeAusgeblendet); if (weg.length) { D.belege = D.belege.filter(function (x) { return !weg.some(function (w) { return w.id === x.id; }); }); rows = rows.filter(function (r) { return !APP.istPost(r); }); } }
    if (table === 'einstellungen') { rows.forEach(function (r) { D.einst[r.key] = r.value; }); return; }
    if (table === 'hinweise') { rows.forEach(function (r) { D.hinweise[r.key] = r; }); return; }
    var list = D[table], k = KEYS[table];
    rows.forEach(function (r) {
      zahlen(table, r);
      var i = list.findIndex(function (x) { return k.every(function (f) { return x[f] === r[f]; }); });
      if (i >= 0) list[i] = r; else list.push(r);
    });
  }
  APP.merge = merge;
  function check(res) { if (res.error) throw res.error; return res.data; }
  function where(q, match) { Object.keys(match).forEach(function (k) { q = match[k] === null ? q.is(k, null) : Array.isArray(match[k]) ? q.in(k, match[k]) : q.eq(k, match[k]); }); return q; }
  APP.upd = function (table, match, patch) {
    return where(APP.sb.from(table).update(patch), match).select().then(check).then(function (rows) { merge(table, rows || []); return rows; });
  };
  APP.ins = function (table, rows, opt) {
    var q = APP.sb.from(table);
    q = opt && opt.upsert ? q.upsert(rows, { onConflict: opt.upsert, ignoreDuplicates: !!opt.ignore }) : q.insert(rows);
    return q.select().then(check).then(function (r) { merge(table, r || []); return r || []; });
  };
  APP.del = function (table, match) {
    return where(APP.sb.from(table).delete(), match).then(check).then(function () {
      if (D[table] && Array.isArray(D[table])) D[table] = D[table].filter(function (x) { return !Object.keys(match).every(function (k) { return x[k] === match[k]; }); });
    });
  };
  APP.rpc = function (name, args) { return APP.sb.rpc(name, args || {}).then(check); };
  APP.einstellung = function (key, value) {
    return APP.ins('einstellungen', [{ key: key, value: value }], { upsert: 'key' }).then(function () { D.einst[key] = value; });
  };
  function alle(table, order) {
    var out = [], step = 1000;
    function page(from) {
      var q = APP.sb.from(table).select('*').range(from, from + step - 1);
      (order || []).forEach(function (o) { q = q.order(o, { ascending: true }); });
      return q.then(check).then(function (rows) { out = out.concat(rows || []); return rows && rows.length === step ? page(from + step) : out; });
    }
    return page(0);
  }
  APP.laden = function () {
    S.laedt = true;
    return Promise.all([
      alle('belege', ['jahr', 'monat', 'nr', 'datum']), alle('bank', ['datum', 'schluessel']), alle('ausgang', ['jahr', 'laufnr']),
      alle('kunden', ['kurz']), alle('monate', ['jahr', 'monat']), alle('einstellungen'), alle('fragen', ['created_at']),
      alle('hinweise'), alle('members')
    ]).then(function (r) {
      APP.ausgeblendet = {};
      D.belege = r[0].filter(function (x) { if (APP.istPost(x)) { APP.merkeAusgeblendet(x); return false; } return true; }).map(function (x) { return zahlen('belege', x); });
      D.bank = r[1].map(function (x) { return zahlen('bank', x); });
      D.ausgang = r[2].map(function (x) { return zahlen('ausgang', x); });
      D.kunden = r[3]; D.monate = r[4].map(function (x) { return zahlen('monate', x); });
      D.einst = {}; r[5].forEach(function (x) { D.einst[x.key] = x.value; });
      D.fragen = r[6]; D.hinweise = {}; r[7].forEach(function (x) { D.hinweise[x.key] = x; });
      D.members = r[8];
      S.geladen = true; S.laedt = false; S.stand = Date.now();
      try { localStorage.setItem('s1tax:cache', JSON.stringify({ t: S.stand, D: D })); } catch (e) { /* zu groß oder privat */ }
    }, function (e) { S.laedt = false; throw e; });
  };
  APP.ausCache = function () {
    try { var c = JSON.parse(localStorage.getItem('s1tax:cache') || 'null'); if (c && c.D) { Object.assign(D, c.D); S.geladen = true; S.stand = c.t; S.ausCache = true; return true; } } catch (e) { /* kein Zwischenstand */ }
    return false;
  };

  /* ---------- Dateien ---------- */
  var urlCache = {};
  APP.dateiUrl = function (bucket, path, download) {
    var k = bucket + '/' + path + (download ? '?d' : '');
    if (urlCache[k] && urlCache[k].t > Date.now() - 50 * 60000) return Promise.resolve(urlCache[k].u);
    return APP.sb.storage.from(bucket).createSignedUrl(path, 3600, download ? { download: download } : undefined).then(check).then(function (d) { urlCache[k] = { u: d.signedUrl, t: Date.now() }; return d.signedUrl; });
  };
  APP.hochladen = function (bucket, path, blob, type) {
    return APP.sb.storage.from(bucket).upload(path, blob, { contentType: type || blob.type || 'application/octet-stream', upsert: false }).then(check);
  };
  APP.herunterladen = function (bucket, path) { return APP.sb.storage.from(bucket).download(path).then(check); };
  APP.speichernUnter = function (blob, name) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000);
  };
  APP.oeffnen = function (bucket, path) {
    var w = window.open('about:blank', '_blank');
    return APP.dateiUrl(bucket, path).then(function (u) { if (w) w.location = u; else location.href = u; }, function (e) { if (w) w.close(); APP.fehler(e, 'Datei'); });
  };

  /* ---------- Dienste (Edge Functions) ---------- */
  APP.fn = function (name, body, query) {
    return APP.sb.auth.getSession().then(function (r) {
      var tok = r && r.data && r.data.session ? r.data.session.access_token : CFG.key;
      return fetch(CFG.url + '/functions/v1/' + name + (query ? '?' + query : ''), {
        method: body ? 'POST' : 'GET', headers: { apikey: CFG.key, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
    }).then(function (res) {
      return res.text().then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { j = { error: t }; }
        if (!res.ok) { var err = new Error(j.error || j.message || ('Dienst ' + name + ': HTTP ' + res.status)); err.status = res.status; err.code = j.code; throw err; }
        return j;
      });
    });
  };

  /* ---------- Navigation ---------- */
  APP.NAV = [
    ['uebersicht', 'Übersicht'], ['monat', 'Monate und Belege'], ['bank', 'Bankabgleich'], ['uva', 'Umsatzsteuer'], ['steuer', 'Steuern und Termine'],
    ['ausgang', 'Ausgangsrechnungen'], ['abos', 'Abos und Fixkosten'], ['anlagen', 'Anlagen und Garantie'], ['paket', 'Jahrespaket'],
    ['fragen', 'Rückfragen'], ['einstellungen', 'Einstellungen']
  ];
  var ALIAS = { rechnung: 'ausgang', kunden: 'ausgang', suche: 'suche', protokoll: 'einstellungen' };
  /* App neu laden: holt die neueste Version und frische Daten, ohne die App zu schließen */
  APP.A.aktualisieren = function (el) {
    if (el) el.classList.add('dreht');
    var reg = navigator.serviceWorker && navigator.serviceWorker.getRegistration ? navigator.serviceWorker.getRegistration().catch(function () { return null; }) : Promise.resolve(null);
    reg.then(function (r) { return r && r.update ? r.update().catch(function () { /* egal */ }) : null; }).then(function () {
      try { sessionStorage.setItem('s1tax:aktualisiert', '1'); } catch (e) { /* egal */ }
      location.reload();
    });
  };
  APP.go = function (hash) { if (('#' + hash) === location.hash) APP.render(); else location.hash = hash; };
  APP.parseHash = function () {
    var hsh = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'uebersicht';
    var i = hsh.indexOf('/');
    S.view = i < 0 ? hsh : hsh.slice(0, i); S.arg = i < 0 ? '' : hsh.slice(i + 1);
    if (!APP.V[S.view]) { S.view = 'uebersicht'; S.arg = ''; }
  };
  APP.jm = function (arg) {
    var m = String(arg || '').match(/^(\d{4})-(\d{1,2})/), h = L.heute();
    return m ? { jahr: +m[1], monat: +m[2] } : { jahr: S.jahr || +h.slice(0, 4), monat: S.monat || +h.slice(5, 7) };
  };
  function badges() {
    var ich = APP.ich(), b = {};
    var neu = L.gruppen(D.belege, function (x) { return !x.storniert && !x.bestaetigt; }).length;
    if (neu) b.monat = neu;
    var bo = D.bank.filter(function (x) { return x.art === 'offen'; }).length; if (bo) b.bank = bo;
    var fr = D.fragen.filter(function (f) { return !f.erledigt && (!f.antwort ? f.von !== ich : f.von === ich); }).length; if (fr) b.fragen = fr;
    var ar = D.ausgang.filter(function (a) { return a.entwurf || (L.offen(a) && L.tageBis(L.faelligAm(a)) < 0); }).length; if (ar) b.ausgang = ar;
    return b;
  }
  APP.badges = badges;
  function shell(inner) {
    var cur = ALIAS[S.view] || S.view, b = badges(), me = S.me || {};
    var nav = APP.NAV.map(function (n) {
      return '<button type="button" data-go="' + n[0] + '"' + (cur === n[0] ? ' aria-current="page"' : '') + '><span>' + n[1] + '</span>' + (b[n[0]] ? '<span class="badge">' + b[n[0]] + '</span>' : '') + '</button>';
    }).join('');
    var off = !S.online ? '<div class="offline">Kein Netz. Du siehst den letzten Stand; Fotos von Belegen werden gespeichert und später hochgeladen.' + (APP.warteschlangeAnzahl ? ' Wartend: ' + APP.warteschlangeAnzahl : '') + '</div>' : (APP.warteschlangeAnzahl ? '<div class="offline">' + APP.warteschlangeAnzahl + ' Beleg(e) warten aufs Hochladen …</div>' : '');
    var tab = function (v, label, ic, extra) { return '<button type="button" data-go="' + v + '"' + (cur === v ? ' aria-current="page"' : '') + '>' + APP.icon(ic, 22) + '<span>' + label + '</span>' + (extra || '') + '</button>'; };
    return '<div class="shell">' +
      '<aside class="side"><button type="button" class="brand" data-go="uebersicht" aria-label="Zur Übersicht"><div class="logo">S1</div><div><b>S1 Tax</b><span class="s">' + APP.h((D.einst.firma || {}).name || 'S1 Secure e.U.') + '</span></div></button>' +
      '<form role="search" data-form="suche"><label class="f" for="q">Suchen<input class="in" id="q" name="q" type="search" placeholder="Lieferant, Betrag, Nummer" value="' + APP.h(S.q) + '"></label></form>' +
      '<nav class="nav" aria-label="Hauptmenü">' + nav + '</nav>' +
      '<div class="who"><span>Angemeldet als <b>' + APP.h(me.name || '') + '</b>' + (me.rolle === 'kontrolle' ? ' · Kontrolle' : '') + '</span><div class="chips"><button type="button" class="btn small" data-act="aktualisieren">' + APP.icon('neu', 14) + ' Aktualisieren</button><button type="button" class="btn small" data-act="abmelden">Abmelden</button></div><span>Version ' + APP.VERSION + '</span></div></aside>' +
      '<header class="mobil-top"><button type="button" class="brand" data-go="uebersicht" aria-label="Zur Übersicht"><div class="logo">S1</div><b>S1 Tax</b></button><div class="kopf"><button type="button" class="btn small" data-act="aktualisieren" aria-label="Aktualisieren">' + APP.icon('neu') + '</button><button type="button" class="btn small" data-go="suche" aria-label="Suchen">' + APP.icon('such') + '</button></div></header>' +
      '<main class="main" id="main">' + (S.neueVersion ? '<div class="offline neuv"><span class="grow">Es gibt eine neue Version der App.</span><button type="button" class="btn small pri" data-act="aktualisieren">Jetzt aktualisieren</button></div>' : '') + off + inner + '</main>' +
      '<nav class="tabbar" aria-label="Kurzmenü">' + tab('uebersicht', 'Übersicht', 'haus', (b.fragen ? '<span class="dot"></span>' : '')) + tab('monat', 'Belege', 'belege', b.monat ? '<span class="dot"></span>' : '') +
      '<button type="button" class="scan" data-act="foto">' + APP.icon('kamera', 24) + '<span>Scannen</span></button>' +
      tab('bank', 'Bank', 'bank', b.bank ? '<span class="dot"></span>' : '') + '<button type="button" data-act="mehr"' + (['uebersicht', 'monat', 'bank'].indexOf(cur) < 0 ? ' aria-current="page"' : '') + '>' + APP.icon('mehr', 22) + '<span>Mehr</span></button></nav>' +
      '</div>';
  }
  APP.render = function () {
    var app = document.getElementById('app');
    if (S.gesperrt) { app.innerHTML = APP.V.sperre.render(); return; }
    if (!S.me) { app.innerHTML = APP.V.login.render(); if (APP.V.login.after) APP.V.login.after(); return; }
    APP.parseHash();
    var v = APP.V[S.view], html;
    try { html = v.render(S.arg); } catch (e) { console.error(e); html = '<div class="card"><h2>Hier ist etwas schiefgegangen</h2><p class="mut">' + APP.h(e.message) + '</p><button class="btn" data-go="uebersicht">Zur Übersicht</button></div>'; }
    var y = window.scrollY, same = APP._last === location.hash;
    app.innerHTML = shell(html);
    document.title = (v.titel ? (typeof v.titel === 'function' ? v.titel(S.arg) : v.titel) + ' · ' : '') + 'S1 Tax';
    window.scrollTo(0, same ? y : 0);
    APP._last = location.hash;
    if (v.after) v.after(S.arg);
  };
  window.addEventListener('hashchange', function () { APP.render(); });

  /* ---------- Klicks, Formulare ---------- */
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]');
    if (g && !g.disabled) { e.preventDefault(); APP.schliessenWennOffen(g); APP.go(g.dataset.go); return; }
    var a = e.target.closest('[data-act]');
    if (a && !a.disabled) {
      var f = APP.A[a.dataset.act];
      if (f) { if (a.tagName !== 'INPUT') e.preventDefault(); f(a, e); }
    }
  });
  APP.schliessenWennOffen = function (el) { if (dlg().open && dlg().contains(el)) APP.schliessen(); };
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-form]'); if (!f) return;
    e.preventDefault();
    var fn = APP.A['form-' + f.dataset.form]; if (fn) fn(f, e);
  });
  APP.A.schliessen = function () { APP.schliessen(); };
  APP.A['form-suche'] = function (f) { S.q = f.q.value.trim(); APP.go('suche/' + encodeURIComponent(S.q)); };
  APP.formDaten = function (root) {
    var o = {};
    APP.$$('[name]', root).forEach(function (el) {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value;
    });
    return o;
  };
  APP.A.mehr = function () {
    var b = badges();
    APP.modal({
      title: 'Menü', body: '<nav class="nav">' + APP.NAV.map(function (n) { return '<button type="button" data-go="' + n[0] + '"><span>' + n[1] + '</span>' + (b[n[0]] ? '<span class="badge">' + b[n[0]] + '</span>' : '') + '</button>'; }).join('') + '</nav>' +
        '<p class="s">Angemeldet als ' + APP.h((S.me || {}).name) + ' · Version ' + APP.VERSION + '</p><button type="button" class="btn" data-act="abmelden">Abmelden</button>'
    });
  };

  /* Monatsknöpfe für Belege, Bank, UVA */
  APP.monatsLeiste = function (view, j, m, extra) {
    var out = '<div class="months" role="group" aria-label="Monat wählen">';
    for (var i = 1; i <= 12; i++) {
      var mo = L.monat(D, j, i), cls = [];
      if (mo && mo.abgeschlossen_am) cls.push('zu');
      var st = extra ? extra(j, i) : '';
      if (st) cls.push(st);
      out += '<button type="button" data-go="' + view + '/' + j + '-' + i + '" class="' + cls.join(' ') + '"' + (i === m ? ' aria-current="true"' : '') + ' aria-label="' + L.MONATE[i] + ' ' + j + '">' + L.MON[i] + '</button>';
    }
    return out + '</div>';
  };
  APP.jahrWahl = function (view, j, sep) {
    var jahre = {}; jahre[j] = 1; jahre[+L.heute().slice(0, 4)] = 1;
    if (view === 'paket') jahre[+L.heute().slice(0, 4) - 1] = 1;
    D.belege.forEach(function (b) { jahre[b.jahr] = 1; }); D.bank.forEach(function (b) { jahre[b.jahr] = 1; });
    return '<div class="seg" role="group" aria-label="Jahr">' + Object.keys(jahre).sort().map(function (y) {
      return '<button type="button" data-go="' + view + '/' + y + (sep || '') + '" aria-pressed="' + (+y === j) + '">' + y + '</button>';
    }).join('') + '</div>';
  };
})();
