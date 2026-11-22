/* S1 Tax · Start: Anmeldung prüfen, Daten laden, Hintergrunddienst, automatische Sicherung */
(function () {
  'use strict';
  var APP = window.APP, S = APP.S, CFG = APP.CFG;

  function fehlerSeite(text) {
    document.getElementById('app').innerHTML = '<div class="login"><div class="card"><h2>S1 Tax startet nicht</h2><p>' + APP.h(text) + '</p><button class="btn pri" onclick="location.reload()">Nochmal versuchen</button></div></div>';
  }
  /* App-Sperre: beim Öffnen und nach 5 Minuten im Hintergrund mit Face ID / Fingerabdruck entsperren */
  function lies(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  APP.sperreAn = function () {
    var s = lies('s1tax:sperre');
    return APP.passkeyMoeglich() && (s === '1' || (s === null && lies('s1tax:passkey') === '1'));
  };
  APP.entsperrt = function (ja) {
    try { if (ja === true) sessionStorage.setItem('s1tax:offen', '1'); else if (ja === false) sessionStorage.removeItem('s1tax:offen'); return sessionStorage.getItem('s1tax:offen') === '1'; } catch (e) { return ja === true; }
  };
  APP.nachAnmeldung = function (frisch) {
    if (frisch) APP.entsperrt(true);
    return APP.sb.auth.getSession().then(function (r) {
      var sess = r && r.data && r.data.session;
      if (!sess) { S.me = null; S.gesperrt = false; APP.render(); return; }
      if (APP.sperreAn() && !APP.entsperrt()) { S.gesperrt = true; APP.render(); return; }
      S.gesperrt = false;
      var user = sess.user;
      return APP.sb.from('members').select('*').eq('user_id', user.id).maybeSingle().then(function (m) {
        if (m.error) throw m.error;
        if (!m.data) {
          S.loginFehler = 'Dieses Konto ist für S1 Tax nicht freigeschaltet.';
          return APP.sb.auth.signOut().then(function () { S.me = null; APP.render(); });
        }
        S.me = { person: m.data.person, name: m.data.name, rolle: m.data.rolle, email: user.email };
        try { localStorage.setItem('s1tax:me', JSON.stringify(S.me)); } catch (e) { /* egal */ }
        return APP.laden().then(function () { S.ausCache = false; APP.render(); danach(); });
      }).catch(function (e) {
        /* ohne Netz: letzter Stand aus dem Gerät */
        var me = null; try { me = JSON.parse(localStorage.getItem('s1tax:me') || 'null'); } catch (x) { me = null; }
        if (me && APP.ausCache()) { S.me = me; S.online = false; APP.render(); APP.toast('Kein Netz: letzter gespeicherter Stand.'); return; }
        APP.fehler(e, 'Laden'); S.me = null; APP.render();
      });
    });
  };
  function danach() {
    APP.warteschlangeSenden();
    APP.autoBestaetigen().then(function (n) { if (n) { APP.ok(n === 1 ? 'Ein eindeutiger Beleg wurde automatisch bestätigt.' : n + ' eindeutige Belege wurden automatisch bestätigt.'); APP.render(); } }).catch(function (e) { APP.fehler(e, 'Automatisch bestätigen'); });
    APP.pushPruefen();
    APP.ordnerLaden().then(function () { if (APP.ordner.handle && APP.ordner.recht === 'granted') APP.sichern(true); });
  }
  function start() {
    if (!window.supabase || !window.supabase.createClient) { fehlerSeite('Die Verbindung zur Datenbank konnte nicht geladen werden. Bitte Internet prüfen.'); return; }
    if (!CFG.url || !CFG.key) { fehlerSeite('config.js fehlt.'); return; }
    APP.sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 's1tax-auth', experimental: { passkey: true } } });
    APP.sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT' && S.me) { S.me = null; APP.render(); } });
    APP.nachAnmeldung().catch(function (e) { APP.fehler(e); APP.render(); });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { try { sessionStorage.setItem('s1tax:weg', String(Date.now())); } catch (e) { /* egal */ } return; }
    var weg = 0; try { weg = Number(sessionStorage.getItem('s1tax:weg') || 0); } catch (e) { weg = 0; }
    if (S.me && APP.sperreAn() && weg && Date.now() - weg > 5 * 60000) {
      APP.entsperrt(false); S.gesperrt = true;
      try { document.getElementById('dlg').close(); } catch (e) { /* egal */ }
      APP.render(); return;
    }
    if (document.visibilityState !== 'visible' || !S.me || !navigator.onLine || S.laedt) return;
    if (Date.now() - (S.stand || 0) < 60000) return;
    var offen = document.getElementById('dlg').open, tippt = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    APP.laden().then(function () { if (!offen && !tippt) APP.render(); }).catch(function () {});
  });
  /* neue Version da? index.html vergleichen (die Dateien tragen ?v=…) */
  var geladenV = (function () { var x = document.querySelector('script[src*="js/core.js"]'); var m = x && x.getAttribute('src').match(/[?&]v=([\w.]+)/); return m ? m[1] : null; })();
  var zuletztGeprueft = 0;
  function versionPruefen() {
    if (!geladenV || !navigator.onLine || S.neueVersion || Date.now() - zuletztGeprueft < 5 * 60000) return;
    zuletztGeprueft = Date.now();
    fetch('index.html?pruef=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      var m = t.match(/js\/core\.js\?v=([\w.]+)/);
      if (!m || m[1] === geladenV) return;
      S.neueVersion = true;
      var offen = document.getElementById('dlg').open, tippt = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (!offen && !tippt && S.me) APP.render();
    }).catch(function () { /* egal */ });
  }
  APP.versionPruefen = versionPruefen;
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') versionPruefen(); });
  setInterval(versionPruefen, 30 * 60000);
  setTimeout(versionPruefen, 8000);
  try { if (sessionStorage.getItem('s1tax:aktualisiert')) { sessionStorage.removeItem('s1tax:aktualisiert'); setTimeout(function () { APP.toast('Aktualisiert · Version ' + APP.VERSION); }, 1200); } } catch (e) { /* egal */ }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
