/* S1 Tax · Geräte-Funktionen
   Belege hochladen (auch ohne Netz: Warteschlange im Gerät), Fotos verkleinern,
   Sicherung in den OneDrive-Ordner am PC, Mitteilungen aufs Handy, Passkey. */
(function () {
  'use strict';
  var APP = window.APP, L = window.L, D = APP.D, S = APP.S;

  /* ---------- kleiner Speicher im Gerät (IndexedDB) ---------- */
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('s1tax', 1);
      r.onupgradeneeded = function () { var db = r.result; if (!db.objectStoreNames.contains('warteschlange')) db.createObjectStore('warteschlange', { keyPath: 'id' }); if (!db.objectStoreNames.contains('ordner')) db.createObjectStore('ordner'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function tx(store, mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, mode), s = t.objectStore(store), out;
        var r = fn(s); if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); }; t.onerror = function () { rej(t.error); };
      });
    });
  }
  APP.idb = { put: function (st, v, k) { return tx(st, 'readwrite', function (s) { return k === undefined ? s.put(v) : s.put(v, k); }); }, get: function (st, k) { return tx(st, 'readonly', function (s) { return s.get(k); }); }, all: function (st) { return tx(st, 'readonly', function (s) { return s.getAll(); }); }, del: function (st, k) { return tx(st, 'readwrite', function (s) { return s.delete(k); }); } };

  /* ---------- Fotos verkleinern ---------- */
  APP.bildVerkleinern = function (file) {
    if (!/^image\//.test(file.type) || /gif|svg/.test(file.type)) return Promise.resolve(file);
    return new Promise(function (res) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        var max = 2200, w = img.naturalWidth, h = img.naturalHeight, f = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * f); c.height = Math.round(h * f);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        c.toBlob(function (b) { res(b && b.size < file.size ? b : file); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(u); res(file); };
      img.src = u;
    });
  };
  function sha256(blob) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve(null);
    return blob.arrayBuffer().then(function (b) { return crypto.subtle.digest('SHA-256', b); }).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }).catch(function () { return null; });
  }
  function endung(blob, name) {
    var t = blob.type || '';
    if (/pdf/.test(t)) return 'pdf'; if (/jpe?g/.test(t)) return 'jpg'; if (/png/.test(t)) return 'png'; if (/webp/.test(t)) return 'webp'; if (/heic|heif/.test(t)) return 'heic';
    var m = String(name || '').match(/\.([a-z0-9]{2,5})$/i); return m ? m[1].toLowerCase() : 'pdf';
  }

  /* ---------- Beleg hochladen und lesen lassen ----------
     opt: {jahr, monat, zahlung, quelle, bank (Bankbuchung, die gleich verknüpft wird), lesen} */
  APP.belegAnlegen = function (file, opt) {
    opt = opt || {};
    var jahr = opt.jahr, monat = opt.monat, blob, hash;
    return APP.bildVerkleinern(file).then(function (b) { blob = b; return sha256(b); }).then(function (h) {
      hash = h;
      var doppelt = h && D.belege.find(function (x) { return x.lesung && x.lesung.hash === h && !x.storniert; });
      if (doppelt) { var e = new Error('Diesen Beleg gibt es schon (' + (doppelt.lieferant || 'ohne Namen') + ', ' + L.MONATE[doppelt.monat] + ' ' + doppelt.jahr + ').'); e.doppelt = doppelt; throw e; }
      if (!navigator.onLine) {
        return APP.idb.put('warteschlange', { id: APP.uuid(), blob: blob, name: file.name || 'Foto.jpg', type: blob.type, jahr: jahr, monat: monat, zahlung: opt.zahlung || 'bar', quelle: opt.quelle || 'scan', created: Date.now() })
          .then(function () { return zaehleWarteschlange(); }).then(function () { return { wartet: true }; });
      }
      var path = jahr + '/' + L.p2(monat) + '/' + APP.uuid() + '.' + endung(blob, file.name);
      return APP.hochladen('belege', path, blob).then(function () {
        return APP.ins('belege', [{ jahr: jahr, monat: monat, gruppe: APP.uuid(), datei: path, quelle: opt.quelle || 'upload', zahlung: opt.zahlung || 'bank', status: 'geschaeftlich', bestaetigt: false, lesung: { hash: hash, dateiname: file.name || null } }]);
      }).then(function (rows) {
        var row = rows[0];
        var link = opt.bank ? APP.upd('bank', { id: opt.bank.id }, { art: 'beleg', beleg_gruppe: row.gruppe }) : Promise.resolve();
        return link.then(function () { return opt.lesen === false ? row : APP.belegLesen(row, opt.bank); });
      });
    });
  };
  /* Die App liest den Beleg (Dienst "beleg-lesen" mit Claude); Ergebnis steht danach in der Datenbank */
  APP.belegLesen = function (row, bank) {
    return APP.fn('beleg-lesen', { id: row.id, bank: bank ? { datum: bank.datum, betrag: bank.betrag, name: bank.name } : null }).then(function (r) {
      /* Post von Finanzamt oder SVS: liegt jetzt bei den Unterlagen, der Beleg ist weg */
      if (r && r.unterlage) {
        D.belege = D.belege.filter(function (b) { return b.gruppe !== row.gruppe; });
        D.fragen = D.fragen.filter(function (f) { return f.datensatz !== row.id; });
        D.einst.unterlagen = (D.einst.unterlagen || []).concat([r.unterlage]);
        if (r.steuer) D.einst.steuer = r.steuer;
        return Object.assign(row, { r: r, abgelegt: r.unterlage });
      }
      return APP.sb.from('belege').select('*').eq('gruppe', row.gruppe).then(function (res) {
        if (res.error) throw res.error;
        APP.merge('belege', res.data || []);
        var neu = res.data && res.data[0];
        /* Barbeleg oder fotografierter Kartenbeleg: Monat nach dem Belegdatum, solange der Monat noch offen ist */
        if (neu && (neu.zahlung === 'bar' || neu.quelle === 'scan') && neu.datum && !neu.nr && !bank) {
          var j = +neu.datum.slice(0, 4), m = +neu.datum.slice(5, 7), mo = L.monat(D, j, m);
          if ((j !== neu.jahr || m !== neu.monat) && !(mo && mo.abgeschlossen_am) && Math.abs((j * 12 + m) - (neu.jahr * 12 + neu.monat)) <= 2)
            return APP.upd('belege', { gruppe: neu.gruppe }, { jahr: j, monat: m }).then(function () { return Object.assign(neu, { verschoben: L.MONATE[m] + ' ' + j, r: r }); });
        }
        return Object.assign(neu || row, { r: r });
      });
    }).catch(function (e) {
      if (e && (e.status === 404 || /not found|nicht eingerichtet|ANTHROPIC/i.test(e.message))) {
        row.leseFehler = 'Das automatische Lesen ist noch nicht eingerichtet. Bitte die Angaben selbst eintragen.';
      } else row.leseFehler = 'Lesen hat nicht geklappt: ' + (e && e.message || e);
      return row;
    });
  };

  /* Beleg von Hand als Post ablegen (z. B. Bescheid, der als Beleg gelesen wurde) */
  APP.alsPostAblegen = function (g) {
    var rows = D.belege.filter(function (b) { return b.gruppe === g; }), f = rows[0];
    if (!f || !f.datei) return Promise.reject(new Error('Der Beleg hat keine Datei.'));
    var ext = String(f.datei).split('.').pop(), stelle = f.lieferant || 'Behörde', titel = f.text || 'Schreiben';
    var j = f.datum ? +f.datum.slice(0, 4) : f.jahr;
    var eintrag = { id: APP.uuid(), jahr: j, pfad: f.datei, name: (stelle + ' – ' + titel + '.' + ext).replace(/[\\/:*?"<>|]+/g, '-'), am: L.heute(), von: (S.me || {}).name || null, art: 'behoerde', stelle: stelle, titel: titel, datum: f.datum || null, info: {} };
    /* Belege werden nie gelöscht: storniert und als Post markiert, die App blendet sie aus */
    return APP.einstellung('unterlagen', (D.einst.unterlagen || []).concat([eintrag])).then(function () {
      return APP.sb.from('fragen').update({ erledigt: true, antwort: 'Post vom Amt, bei den Unterlagen abgelegt.' }).in('datensatz', rows.map(function (b) { return b.id; })).eq('erledigt', false);
    }).then(function (res) {
      if (res && res.error) throw res.error;
      return APP.sb.from('belege').update({ storniert: true, notiz: 'Post vom Amt, bei den Unterlagen abgelegt', lesung: Object.assign({}, f.lesung || {}, { post: eintrag.id }) }).eq('gruppe', g);
    }).then(function (res) {
      if (res && res.error) throw res.error;
      D.belege = D.belege.filter(function (b) { return b.gruppe !== g; });
      D.fragen = D.fragen.filter(function (x) { return !rows.some(function (b) { return b.id === x.datensatz; }); });
      return eintrag;
    });
  };

  /* ---------- Warteschlange ohne Netz ---------- */
  function zaehleWarteschlange() {
    return APP.idb.all('warteschlange').then(function (l) { APP.warteschlangeAnzahl = (l || []).length; return l || []; }).catch(function () { return []; });
  }
  APP.warteschlangeSenden = function () {
    if (!navigator.onLine || !S.me || APP._sendet) return Promise.resolve();
    APP._sendet = true;
    return zaehleWarteschlange().then(function (list) {
      var n = 0;
      return list.reduce(function (p, it) {
        return p.then(function () {
          var file = new File([it.blob], it.name, { type: it.type });
          return APP.belegAnlegen(file, { jahr: it.jahr, monat: it.monat, zahlung: it.zahlung, quelle: it.quelle })
            .then(function () { n++; return APP.idb.del('warteschlange', it.id); })
            .catch(function (e) { if (e && e.doppelt) return APP.idb.del('warteschlange', it.id); throw e; });
        });
      }, Promise.resolve()).then(function () { if (n) APP.toast(n + (n === 1 ? ' Beleg' : ' Belege') + ' nachträglich hochgeladen.'); });
    }).catch(function (e) { APP.fehler(e, 'Hochladen'); }).then(function () { APP._sendet = false; return zaehleWarteschlange(); }).then(function () { APP.render(); });
  };
  window.addEventListener('online', function () { S.online = true; APP.warteschlangeSenden(); if (S.me) APP.laden().then(APP.render, function () {}); });
  window.addEventListener('offline', function () { S.online = false; if (S.me) APP.render(); });
  zaehleWarteschlange();

  /* ---------- Sicherung in OneDrive (Ordner am PC) ---------- */
  APP.ordner = { handle: null, recht: 'nein', laeuft: false, letzte: null };
  try { APP.ordner.letzte = JSON.parse(localStorage.getItem('s1tax:sicherung') || 'null'); } catch (e) { APP.ordner.letzte = null; }
  APP.ordnerMoeglich = function () { return !!window.showDirectoryPicker; };
  APP.ordnerLaden = function () {
    if (!APP.ordnerMoeglich()) return Promise.resolve();
    return APP.idb.get('ordner', 'onedrive').then(function (h) {
      APP.ordner.handle = h || null;
      if (!h) return;
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) { APP.ordner.recht = p; });
    }).catch(function () {});
  };
  APP.ordnerWaehlen = function () {
    return window.showDirectoryPicker({ id: 's1tax', mode: 'readwrite' }).then(function (h) {
      APP.ordner.handle = h; APP.ordner.recht = 'granted';
      return APP.idb.put('ordner', h, 'onedrive');
    });
  };
  function unterordner(dir, pfad) {
    return pfad.split('/').filter(Boolean).reduce(function (p, n) { return p.then(function (d) { return d.getDirectoryHandle(n, { create: true }); }); }, Promise.resolve(dir));
  }
  function schreiben(dir, pfad, blob) {
    var teile = pfad.split('/'), name = teile.pop();
    return unterordner(dir, teile.join('/')).then(function (d) { return d.getFileHandle(name, { create: true }); }).then(function (fh) {
      return fh.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }); });
    });
  }
  function entfernen(dir, pfad) {
    var teile = pfad.split('/'), name = teile.pop();
    return teile.reduce(function (p, n) { return p.then(function (d) { return d.getDirectoryHandle(n); }); }, Promise.resolve(dir)).then(function (d) { return d.removeEntry(name); }).catch(function () {});
  }
  APP.sichern = function (still) {
    var o = APP.ordner;
    if (!o.handle || o.laeuft) return Promise.resolve();
    var ok = o.recht === 'granted' ? Promise.resolve('granted') : still ? Promise.resolve('nein') : o.handle.requestPermission({ mode: 'readwrite' });
    return ok.then(function (p) {
      o.recht = p;
      if (p !== 'granted') { if (!still) APP.toast('Ohne Erlaubnis für den Ordner kann die App nicht sichern.', { bad: true }); return; }
      o.laeuft = true; if (!still) APP.render();
      var log = {}; try { log = JSON.parse(localStorage.getItem('s1tax:sicherung-log') || '{}'); } catch (e) { log = {}; }
      var neu = 0, jobs = [];
      (D.einst.unterlagen || []).forEach(function (u) {
        var ziel = 'Steuererklaerung/' + u.jahr + '/' + String(u.name || 'Unterlage').replace(/[\\/:*?"<>|]+/g, '-');
        if (log[u.pfad] === ziel) return;
        jobs.push(function () {
          return APP.herunterladen('belege', u.pfad).then(function (blob) { return schreiben(o.handle, ziel, blob); }).then(function () { log[u.pfad] = ziel; neu++; });
        });
      });
      L.gruppen(D.belege, function (b) { return !!b.datei; }).forEach(function (g) {
        var ziel = 'Belege/' + g.jahr + '/' + L.p2(g.monat) + '/' + (g.storniert ? 'storniert_' : '') + L.dateiname(g);
        if (log[g.datei] === ziel) return;
        jobs.push(function () {
          return APP.herunterladen('belege', g.datei).then(function (blob) { return schreiben(o.handle, ziel, blob); })
            .then(function () { if (log[g.datei]) return entfernen(o.handle, log[g.datei]); }).then(function () { log[g.datei] = ziel; neu++; });
        });
      });
      D.ausgang.forEach(function (a) {
        if (!a.datei) return;
        var ziel = 'Ausgangsrechnungen/' + a.jahr + '/Re_' + String(a.nr || '').replace('/', '-') + '_' + String(a.kunde).replace(/[^\wÄÖÜäöüß.-]+/g, '-') + '.pdf';
        if (log[a.datei] === ziel) return;
        jobs.push(function () {
          return APP.herunterladen('rechnungen', a.datei).then(function (blob) { return schreiben(o.handle, ziel, blob); }).then(function () { log[a.datei] = ziel; neu++; });
        });
      });
      (D.einst.auszuege || []).forEach(function (p) {
        var ziel = 'Kontoauszuege/' + p.split('/')[0] + '/' + p.split('/').pop();
        if (log[p] === ziel) return;
        jobs.push(function () { return APP.herunterladen('belege', p).then(function (blob) { return schreiben(o.handle, ziel, blob); }).then(function () { log[p] = ziel; neu++; }); });
      });
      /* Excel: jeder Monat mit Daten, dazu die Rechnungsnummern */
      var monate = {};
      D.belege.forEach(function (b) { monate[b.jahr + '-' + b.monat] = [b.jahr, b.monat]; });
      Object.keys(monate).forEach(function (k) {
        var jm = monate[k];
        jobs.push(function () { return window.XLSXW.build(L.monatsExcel(D, jm[0], jm[1])).then(function (blob) { return schreiben(o.handle, 'Monats-Excel/' + jm[0] + '/' + L.monatsDatei(jm[0], jm[1]), blob); }); });
      });
      jobs.push(function () { return window.XLSXW.build(L.rechnungsnummernExcel(D)).then(function (blob) { return schreiben(o.handle, 'Rechnungsnummern.xlsx', blob); }); });
      /* alle Daten als JSON: aktueller Stand und je Monat eine Kopie (Supabase Free hat keine eigene Sicherung) */
      jobs.push(function () {
        var blob = APP.datenExport(), monat = L.heute().slice(0, 7);
        return schreiben(o.handle, 'Datensicherung/S1-Tax-Daten-aktuell.json', blob).then(function () {
          if (log['json:' + monat]) return;
          return schreiben(o.handle, 'Datensicherung/S1-Tax-Daten-' + monat + '.json', blob).then(function () { log['json:' + monat] = 1; });
        });
      });
      return jobs.reduce(function (p, j) { return p.then(j); }, Promise.resolve()).then(function () {
        localStorage.setItem('s1tax:sicherung-log', JSON.stringify(log));
        o.letzte = { zeit: new Date().toISOString(), neu: neu, ordner: o.handle.name };
        localStorage.setItem('s1tax:sicherung', JSON.stringify(o.letzte));
        if (!still) APP.toast('Gesichert: ' + (neu ? neu + ' neue Datei' + (neu === 1 ? '' : 'en') + ', ' : '') + 'Excel-Dateien aktualisiert.');
      });
    }).catch(function (e) { if (!still) APP.fehler(e, 'Sicherung'); }).then(function () { o.laeuft = false; if (!still) APP.render(); });
  };

  APP.datenExport = function () {
    var daten = { app: 'S1 Tax', version: APP.VERSION, stand: new Date().toISOString(), belege: D.belege, bank: D.bank, ausgang: D.ausgang, kunden: D.kunden, monate: D.monate, einstellungen: D.einst, fragen: D.fragen, hinweise: D.hinweise };
    return new Blob([JSON.stringify(daten)], { type: 'application/json' });
  };

  /* ---------- Mitteilungen aufs Handy ---------- */
  var push = APP.push = { checked: false, on: false, busy: false, step: '', err: '' };
  function pushMoeglich() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  APP.isIos = function () { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); };
  APP.alsApp = function () { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; };
  function b64(s) { var p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function zeit(promise, ms, msg) { return new Promise(function (res, rej) { var t = setTimeout(function () { rej(new Error(msg)); }, ms); Promise.resolve(promise).then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); }); }); }
  function swBereit() {
    return zeit(navigator.serviceWorker.ready, 8000, 'Der Hintergrunddienst startet nicht.').catch(function () {
      return navigator.serviceWorker.register('sw.js').then(function () { return zeit(navigator.serviceWorker.ready, 8000, 'Der Hintergrunddienst der App startet auf diesem Gerät nicht. Bitte App ganz schließen und neu öffnen.'); });
    });
  }
  function abo(s) {
    return APP.sb.from('push_subs').upsert([{ endpoint: s.endpoint, person: APP.ich(), sub: s.toJSON() }]).then(function (r) { if (r.error) throw r.error; });
  }
  APP.pushPruefen = function () {
    if (!pushMoeglich()) { push.checked = true; return; }
    swBereit().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) {
      push.checked = true; push.on = !!s && Notification.permission === 'granted';
      if (push.on && APP.ich()) abo(s).catch(function () {});
    }).catch(function () { push.checked = true; });
  };
  APP.pushBereich = function () {
    var h = '<div class="card"><div class="head"><h2>Mitteilungen aufs Handy</h2></div>';
    if (APP.isIos() && !APP.alsApp()) h += '<p style="margin:0">Am iPhone kommen Mitteilungen nur, wenn S1 Tax am Home-Bildschirm liegt: in <b>Safari</b> öffnen, unten auf Teilen tippen, dann „Zum Home-Bildschirm“. Danach S1 Tax über das Icon öffnen und hier einschalten.</p>';
    else if (!pushMoeglich()) h += '<p style="margin:0">Dieser Browser kann keine Mitteilungen empfangen. Am Handy: Android mit Chrome, iPhone mit Safari und S1 Tax am Home-Bildschirm.</p>';
    else if (Notification.permission === 'denied') h += '<p style="margin:0">Mitteilungen sind für S1 Tax auf diesem Gerät blockiert. Erlaube sie in den Einstellungen des Handys (Android: auch in Chrome unter Website-Einstellungen), dann öffne die App neu.</p>';
    else if (push.on) h += '<p style="margin:0"><span class="chip ok">Eingeschaltet</span> Dieses Gerät bekommt Erinnerungen: UVA und Steuertermine, überfällige Rechnungen, neue Rückfragen, Garantie und Abos.</p><div class="chips"><button type="button" class="btn small" data-act="push-test"' + (push.busy ? ' disabled' : '') + '>Test-Mitteilung schicken</button><button type="button" class="btn small ghost" data-act="push-aus"' + (push.busy ? ' disabled' : '') + '>Ausschalten</button></div>';
    else h += '<p style="margin:0">Schalte Mitteilungen ein, damit dich die App an Termine und Rückfragen erinnert. Das gilt für dieses Gerät; jedes Handy schaltet es einmal selbst ein.</p>' + (push.step ? '<p class="note">' + APP.h(push.step) + '</p>' : '') + (push.err ? '<p class="note bad">' + APP.h(push.err) + '</p>' : '') +
      '<div><button type="button" class="btn pri" data-act="push-ein"' + (push.busy ? ' disabled' : '') + '>' + (push.busy ? 'Bitte warten …' : 'Mitteilungen einschalten') + '</button></div>';
    return h + '</div>';
  };
  function schritt(t) { push.step = t; push.err = ''; APP.render(); }
  APP.A['push-ein'] = function () {
    push.busy = true; schritt('Schritt 1 von 3: Erlaubnis wird angefragt. Bitte mit „Zulassen“ beantworten.');
    zeit(Notification.requestPermission(), 45000, 'Die Frage nach der Erlaubnis ist nicht erschienen. Bitte in den Einstellungen des Handys Mitteilungen für S1 Tax erlauben.').then(function (p) {
      if (p !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt.');
      schritt('Schritt 2 von 3: Gerät wird beim Mitteilungsdienst angemeldet …');
      return zeit(fetch(APP.CFG.url + '/functions/v1/erinnerungen?key', { headers: { apikey: APP.CFG.key } }).then(function (r) { if (!r.ok) throw new Error('Der Erinnerungsdienst ist gerade nicht erreichbar (HTTP ' + r.status + ').'); return r.json(); }), 20000, 'Der Erinnerungsdienst antwortet nicht.');
    }).then(function (k) {
      return zeit(swBereit().then(function (reg) {
        return reg.pushManager.getSubscription().then(function (old) { return old ? old.unsubscribe() : null; }).then(function () { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(k.publicKey) }); });
      }), 30000, 'Die Anmeldung beim Mitteilungsdienst ist nicht fertig geworden. Bitte App neu öffnen und nochmal versuchen.');
    }).then(function (s) {
      schritt('Schritt 3 von 3: wird gespeichert …');
      return abo(s).catch(function (e) { s.unsubscribe(); throw e; });
    }).then(function () { push.on = true; push.step = ''; push.busy = false; APP.toast('Mitteilungen sind eingeschaltet.'); APP.render(); })
      .catch(function (e) { push.step = ''; push.busy = false; push.err = e && e.message || String(e); APP.render(); });
  };
  APP.pushAus = function (still) {
    if (!pushMoeglich()) return Promise.resolve();
    return swBereit().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) {
      if (!s) return;
      return APP.sb.from('push_subs').delete().eq('endpoint', s.endpoint).then(function () { return s.unsubscribe(); }, function () { return s.unsubscribe(); });
    }).then(function () { push.on = false; if (!still) { APP.toast('Mitteilungen auf diesem Gerät ausgeschaltet.'); APP.render(); } }).catch(function () {});
  };
  APP.A['push-aus'] = function () { APP.pushAus(false); };
  APP.A['push-test'] = function (el) {
    APP.lauf(el, function () { return APP.fn('erinnerungen', {}, 'test').then(function (j) { APP.toast(j.sent ? 'Test-Mitteilung ist unterwegs.' : 'Es kam keine Mitteilung an. Bitte aus- und wieder einschalten.'); }); });
  };

  /* ---------- Passkey (Fingerabdruck, Face ID, Windows Hello) ---------- */
  APP.passkeyMoeglich = function () { return !!(window.PublicKeyCredential && APP.sb && APP.sb.auth && APP.sb.auth.signInWithPasskey); };
  APP.passkeyFehler = function (e) {
    var c = e && (e.code || e.name) || '', m = e && e.message || String(e);
    if (/passkey_disabled|passkeys? (are|is) (disabled|not enabled)/i.test(c + ' ' + m)) return 'Passkeys sind in Supabase noch nicht eingeschaltet (Authentication → Passkeys).';
    if (/NotAllowedError|cancel/i.test(c + m)) return 'Abgebrochen.';
    if (/credential_exists/.test(c + m)) return 'Dieses Gerät ist schon eingerichtet.';
    if (/credential_not_found/.test(c + m)) return 'Für dieses Gerät ist kein Passkey hinterlegt. Bitte einmal mit Passwort anmelden und in den Einstellungen einrichten.';
    return m;
  };
})();
