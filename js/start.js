/* S1 Tax · Start: Anmeldung prüfen, Daten laden, Hintergrunddienst, automatische Sicherung */
(function () {
  'use strict';
  var APP = window.APP, S = APP.S, CFG = APP.CFG;

  function fehlerSeite(text) {
    document.getElementById('app').innerHTML = '<div class="login"><div class="card"><h2>S1 Tax startet nicht</h2><p>' + APP.h(text) + '</p><button class="btn pri" onclick="location.reload()">Nochmal versuchen</button></div></div>';
  }
  APP.nachAnmeldung = function () {
    return APP.sb.auth.getSession().then(function (r) {
      var sess = r && r.data && r.data.session;
      if (!sess) { S.me = null; APP.render(); return; }
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
    if (document.visibilityState !== 'visible' || !S.me || !navigator.onLine || S.laedt) return;
    if (Date.now() - (S.stand || 0) < 60000) return;
    var offen = document.getElementById('dlg').open, tippt = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    APP.laden().then(function () { if (!offen && !tippt) APP.render(); }).catch(function () {});
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
