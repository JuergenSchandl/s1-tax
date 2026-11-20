/* S1 Tax · Rechenlogik (Auszug aus js/logic.js der App für den Erinnerungsdienst) */
(function (root) {
'use strict';
var L = {};
L.r2 = function (x) { return Math.round((Number(x) || 0) * 100 + (x >= 0 ? 1e-9 : -1e-9)) / 100; };
L.n = function (x) { var v = Number(x); return isFinite(v) ? v : 0; };
L.fmt = function (x, opt) {
var v = L.r2(x), neg = v < 0, s = Math.abs(v).toFixed(2).split('.');
s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
return (neg ? '−' : (opt && opt.plus && v > 0 ? '+' : '')) + s[0] + ',' + s[1];
};
L.eur = function (x, opt) { return L.fmt(x, opt) + ' €'; };
L.p2 = function (n) { return (n < 10 ? '0' : '') + n; };
L.MONATE = ['', 'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
L.datum = function (iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; };
L.iso = function (d) { return d.getFullYear() + '-' + L.p2(d.getMonth() + 1) + '-' + L.p2(d.getDate()); };
L.heute = function () { return L.iso(new Date()); };
L.plusTage = function (iso, n) { var p = iso.split('-'); return L.iso(new Date(+p[0], +p[1] - 1, +p[2] + n)); };
L.tageBis = function (iso, von) {
var a = (von || L.heute()).split('-'), b = iso.split('-');
return Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
};
L.monatsEnde = function (j, m) { return j + '-' + L.p2(m) + '-' + L.p2(new Date(j, m, 0).getDate()); };
L.monatPlus = function (j, m, n) { var t = j * 12 + (m - 1) + n; return { jahr: Math.floor(t / 12), monat: (t % 12) + 1 }; };
L.uvaFaellig = function (j, m) { var x = L.monatPlus(j, m, 2); return x.jahr + '-' + L.p2(x.monat) + '-15'; };
L.imMonat = function (iso, j, m) { return !!iso && iso.slice(0, 7) === j + '-' + L.p2(m); };
L.kfz = function (k) { k = Number(k); return k === 630 || (k >= 7250 && k <= 7259); };
L.doppelVerdacht = function (b) { return b.bestaetigt === false && !!(b.lesung && b.lesung.ki && b.lesung.ki.doppelt_gruppe); };
L.zaehlt = function (b) { return !b.storniert && b.status !== 'privat' && !L.doppelVerdacht(b); };
L.ausgestellt = function (a) { return !a.entwurf && !a.storniert; };
L.bezahlt = function (a) { return !!a.bezahlt_am || (a.bezahlt_betrag !== null && a.bezahlt_betrag !== undefined); };
L.offen = function (a) { return L.ausgestellt(a) && !L.bezahlt(a); };
L.faelligAm = function (a) { return L.plusTage(a.datum, Number(a.ziel) || 14); };
L.rgAnteil = function (a) {
var br = L.n(a.brutto), bz = a.bezahlt_betrag === null || a.bezahlt_betrag === undefined ? br : L.n(a.bezahlt_betrag);
return br > 0 && Math.abs(bz - br) > 0.01 ? bz / br : 1;
};
L.istAb = function (D) { return (D.einst.steuer && D.einst.steuer.ist_ab) || '2026-01-01'; };
L.uva = function (D, j, m) {
var istAb = L.istAb(D), r = { jahr: j, monat: m, umsaetze: [], vst: [], rc: [], ig: [], unklar: [], ohne: [] };
var k000 = 0, ust = 0;
D.ausgang.forEach(function (a) {
if (!L.ausgestellt(a) || !L.imMonat(a.bezahlt_am, j, m) || a.datum < istAb) return;
var f = L.rgAnteil(a); k000 += L.n(a.netto) * f; ust += L.n(a.ust) * f; r.umsaetze.push(a);
});
var k060 = 0, k057 = 0, k066 = 0, k070 = 0, k072 = 0, k065 = 0;
D.belege.forEach(function (b) {
if (b.jahr !== j || b.monat !== m || !L.zaehlt(b)) return;
if (b.status === 'unklar') r.unklar.push(b);
var satz = b.steuersatz === null || b.steuersatz === undefined || b.steuerart !== 'vst' ? 20 : L.n(b.steuersatz);
if (b.steuerart === 'vst') { k060 += L.n(b.ust); r.vst.push(b); }
else if (b.steuerart === 'rc') { var s = L.r2(L.n(b.netto) * (b.steuersatz ? L.n(b.steuersatz) : 20) / 100); k057 += s; if (!L.kfz(b.konto)) k066 += s; r.rc.push(b); }
else if (b.steuerart === 'ig') { var t = L.r2(L.n(b.netto) * (b.steuersatz ? L.n(b.steuersatz) : 20) / 100); k070 += L.n(b.netto); k072 += t; if (!L.kfz(b.konto)) k065 += t; r.ig.push(b); }
else r.ohne.push(b);
void satz;
});
r.kz = { '000': L.r2(k000), '022': L.r2(k000), '057': L.r2(k057), '070': L.r2(k070), '072': L.r2(k072), '060': L.r2(k060), '065': L.r2(k065), '066': L.r2(k066) };
r.ust = L.r2(ust);
r.zahllast = L.r2(ust + k057 + k072 - k060 - k066 - k065);
r.faellig = L.uvaFaellig(j, m);
var mo = L.monat(D, j, m);
r.gemeldet = mo && mo.uva_gemeldet_am;
r.bezahlt = mo && (mo.uva_bezahlt_am || (mo.uva_bezahlt !== null && mo.uva_bezahlt !== undefined));
r.gemeldetBetrag = mo && mo.uva_zahllast !== null && mo.uva_zahllast !== undefined ? L.n(mo.uva_zahllast) : null;
r.bezahltBetrag = mo && mo.uva_bezahlt !== null && mo.uva_bezahlt !== undefined ? L.n(mo.uva_bezahlt) : null;
r.zahlung = L.uvaZahlung(D, j, m);
if (!r.bezahlt && r.zahlung) { r.bezahlt = true; r.bezahltBetrag = -L.n(r.zahlung.betrag); }
r.erledigt = r.zahllast <= 0 ? !!r.gemeldet || r.bezahlt : r.bezahlt;
return r;
};
L.uvaZahlung = function (D, j, m) {
return D.bank.find(function (b) {
if (b.betrag >= 0 || !/finanzamt/i.test(b.name)) return false;
var x = String(b.info).match(/\bU\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
if (!x) return false;
var y = Number(x[2]); if (y < 100) y += 2000;
return Number(x[1]) === m && y === j;
}) || null;
};
L.monat = function (D, j, m) { return D.monate.find(function (x) { return x.jahr === j && x.monat === m; }) || null; };
L.ESTQ = [[2, 15], [5, 15], [8, 15], [11, 15]];
L.SVSQ = [[2, 28], [5, 31], [8, 31], [11, 30]];
L.bankNahe = function (D, iso, re, vor, nach) {
return D.bank.find(function (b) { var t = L.tageBis(b.datum, iso); return b.betrag < 0 && re.test(b.name + ' ' + b.info) && t <= vor && -t <= nach; }) || null;
};
L.termine = function (D, jahr) {
var st = D.einst.steuer || {}, out = [];
var istAb = L.istAb(D);
for (var i = -2; i < 10; i++) {
var x = L.monatPlus(jahr, 1, i);
if (L.monatsEnde(x.jahr, x.monat) < istAb) continue;
var u = L.uva(D, x.jahr, x.monat);
if (x.jahr * 12 + x.monat > Number(L.heute().slice(0, 4)) * 12 + Number(L.heute().slice(5, 7)) && !u.gemeldet) {
out.push({ datum: u.faellig, art: 'uva', titel: 'UVA ' + L.MONATE[x.monat] + ' ' + x.jahr, betrag: null, erledigt: false, offenNoch: true, jahr: x.jahr, monat: x.monat });
continue;
}
out.push({ datum: u.faellig, art: 'uva', titel: 'UVA ' + L.MONATE[x.monat] + ' ' + x.jahr, betrag: u.gemeldetBetrag !== null ? u.gemeldetBetrag : u.zahllast, erledigt: u.erledigt, jahr: x.jahr, monat: x.monat, zahlung: u.zahlung });
}
var vzq = L.n(st.est_vz_quartal), man = D.einst.termine_erledigt || {};
L.ESTQ.forEach(function (q) {
var iso = jahr + '-' + L.p2(q[0]) + '-' + L.p2(q[1]);
var z = L.bankNahe(D, iso, /finanzamt.*\bE\b/i, 25, 30), m = man['est|' + iso];
out.push({ datum: iso, art: 'est', key: 'est|' + iso, titel: 'Einkommensteuer-Vorauszahlung', betrag: vzq, erledigt: !!z || !!m, zahlung: z, manuell: m || null });
});
var sq = L.n(st.svs_quartal);
L.SVSQ.forEach(function (q) {
var iso = jahr + '-' + L.p2(q[0]) + '-' + L.p2(q[1]);
var z = L.bankNahe(D, iso, /sozialversicherung|\bsvs\b/i, 25, 30), m = man['svs|' + iso];
out.push({ datum: iso, art: 'svs', key: 'svs|' + iso, titel: 'SVS-Beiträge', betrag: sq, erledigt: !!z || !!m, zahlung: z, manuell: m || null });
});
out.sort(function (a, b) { return a.datum.localeCompare(b.datum); });
return out.filter(function (t) { return t.datum.slice(0, 4) === String(jahr); });
};
if (typeof module !== 'undefined' && module.exports) module.exports = L;
else root.L = L;
})(typeof window !== 'undefined' ? window : globalThis);
