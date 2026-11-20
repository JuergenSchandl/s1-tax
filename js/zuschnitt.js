/* S1 Tax · Belegfotos automatisch zuschneiden und gerade richten
   Findet das helle, ungesättigte Papier im Foto, sucht die vier Ecken und entzerrt die Perspektive.
   Ist die Erkennung unsicher, bleibt das Foto unverändert. Läuft komplett im Gerät, auch ohne Netz. */
(function (root) {
  'use strict';
  var ZS = {};

  /* ---------- Hilfsfunktionen ---------- */
  function boxBlur(src, w, h, r) {
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y, s, n, i;
    for (y = 0; y < h; y++) {
      s = 0; n = 0; var row = y * w;
      for (x = -r; x < w; x++) {
        if (x + r < w) { s += src[row + x + r]; n++; }
        if (x - r - 1 >= 0) { s -= src[row + x - r - 1]; n--; }
        if (x >= 0) tmp[row + x] = s / n;
      }
    }
    for (x = 0; x < w; x++) {
      s = 0; n = 0;
      for (y = -r; y < h; y++) {
        if (y + r < h) { s += tmp[(y + r) * w + x]; n++; }
        if (y - r - 1 >= 0) { s -= tmp[(y - r - 1) * w + x]; n--; }
        if (y >= 0) out[y * w + x] = s / n;
      }
    }
    return out;
  }
  function otsu(v) {
    var hist = new Float64Array(256), n = v.length, i, t;
    for (i = 0; i < n; i++) { t = v[i] < 0 ? 0 : v[i] > 255 ? 255 : v[i] | 0; hist[t]++; }
    var sum = 0, sumB = 0, wB = 0, best = 0, thr = 128, total = 0;
    for (i = 0; i < 256; i++) { sum += i * hist[i]; total += i * i * hist[i]; }
    var mean = sum / n, varT = total / n - mean * mean;
    for (i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      var wF = n - wB; if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF) / (n * n);
      if (between > best) { best = between; thr = i; }
    }
    return { schwelle: thr, trennung: varT > 0 ? best / varT : 0 };
  }
  function flaeche(p) { var a = 0; for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; }
  function huelle(pts) {
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function kreuz(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], hi = [], i;
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && kreuz(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (hi.length >= 2 && kreuz(hi[hi.length - 2], hi[hi.length - 1], pts[i]) <= 0) hi.pop(); hi.push(pts[i]); }
    lo.pop(); hi.pop(); return lo.concat(hi);
  }
  /* größtes Viereck mit Ecken auf der Hülle (lokale Optimierung von zwei Startlagen aus) */
  function viereck(h) {
    var n = h.length; if (n < 4) return null;
    function arg(f) { var b = 0; for (var i = 1; i < n; i++) if (f(h[i]) > f(h[b])) b = i; return b; }
    var starts = [
      [arg(function (p) { return -p[0] - p[1]; }), arg(function (p) { return p[0] - p[1]; }), arg(function (p) { return p[0] + p[1]; }), arg(function (p) { return -p[0] + p[1]; })],
      [arg(function (p) { return -p[0]; }), arg(function (p) { return -p[1]; }), arg(function (p) { return p[0]; }), arg(function (p) { return p[1]; })]
    ];
    var best = null, bestA = -1;
    starts.forEach(function (idx) {
      idx = idx.slice().sort(function (a, b) { return a - b; });
      if (new Set(idx).size < 4) return;
      var a = flaeche(idx.map(function (i) { return h[i]; })), besser = true, runden = 0;
      while (besser && runden++ < 30) {
        besser = false;
        for (var k = 0; k < 4; k++) {
          var vor = idx[(k + 3) % 4], nach = idx[(k + 1) % 4];
          for (var j = (vor + 1) % n; j !== nach; j = (j + 1) % n) {
            var t = idx.slice(); t[k] = j;
            var ta = flaeche(t.map(function (i) { return h[i]; }));
            if (ta > a + 1e-9) { a = ta; idx = t; besser = true; }
          }
        }
      }
      if (a > bestA) { bestA = a; best = idx.map(function (i) { return h[i].slice(); }); }
    });
    return best;
  }
  /* Ecken im Uhrzeigersinn, erste Kante zeigt möglichst nach rechts (Ausrichtung wie im Foto) */
  function ordnen(q) {
    var cx = 0, cy = 0; q.forEach(function (p) { cx += p[0] / 4; cy += p[1] / 4; });
    q = q.slice().sort(function (a, b) { return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx); });
    var best = 0, bestW = 1e9;
    for (var i = 0; i < 4; i++) {
      var a = q[i], b = q[(i + 1) % 4], w = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]));
      if (w < bestW) { bestW = w; best = i; }
    }
    return [q[best], q[(best + 1) % 4], q[(best + 2) % 4], q[(best + 3) % 4]];
  }
  function winkel(q) {
    var out = [];
    for (var i = 0; i < 4; i++) {
      var p = q[(i + 3) % 4], c = q[i], n = q[(i + 1) % 4];
      var ax = p[0] - c[0], ay = p[1] - c[1], bx = n[0] - c[0], by = n[1] - c[1];
      out.push(Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1)))) * 180 / Math.PI);
    }
    return out;
  }

  /* ---------- Beleg finden ----------
     img: {width, height, data} (klein, etwa 500 px), Ergebnis: {ecken:[[x,y]×4], ...} oder {ecken:null, grund} */
  function fuellen(innen, w, h) {
    /* alles, was vom Bildrand aus nicht erreichbar ist, gehört dazu (Schrift, Logos im Beleg) */
    var n = w * h, aussen = new Uint8Array(n), st = new Int32Array(n), sp = 0, i;
    function saat(q) { if (!innen[q] && !aussen[q]) { aussen[q] = 1; st[sp++] = q; } }
    for (i = 0; i < w; i++) { saat(i); saat(n - w + i); }
    for (i = 0; i < h; i++) { saat(i * w); saat(i * w + w - 1); }
    while (sp) {
      var q = st[--sp], qx = q % w;
      if (qx > 0) saat(q - 1); if (qx < w - 1) saat(q + 1); if (q >= w) saat(q - w); if (q < n - w) saat(q + w);
    }
    var out = new Uint8Array(n); for (i = 0; i < n; i++) out[i] = aussen[i] ? 0 : 1;
    return out;
  }
  function gebiet(m, w, h) {
    /* Viereck und Kennzahlen einer gefüllten Fläche */
    var n = w * h, anz = 0, rand = [], seiten = [0, 0, 0, 0], i;
    for (i = 0; i < n; i++) {
      if (!m[i]) continue;
      anz++;
      var x = i % w, y = (i / w) | 0;
      if (y === 0) seiten[0]++; if (x === w - 1) seiten[1]++; if (y === h - 1) seiten[2]++; if (x === 0) seiten[3]++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w]) rand.push([x + 0.5, y + 0.5]);
    }
    if (rand.length < 4) return null;
    var hl = huelle(rand), q = viereck(hl);
    if (!q) return null;
    var aQ = flaeche(q);
    return {
      q: ordnen(q), anteil: aQ / n, fuellung: anz / aQ, rechteck: aQ / flaeche(hl),
      raender: [seiten[0] / w, seiten[1] / h, seiten[2] / w, seiten[3] / h].filter(function (s) { return s > 0.08; }).length
    };
  }
  function pruefen(g, w, h) {
    if (!g) return 'form';
    if (g.anteil > 0.9) return 'voll';
    if (g.anteil < 0.06) return 'klein';
    if (g.raender >= 2) return 'rand';
    if (g.rechteck < 0.9 || g.fuellung < 0.88 || g.fuellung > 1.08) return 'form';
    if (winkel(g.q).some(function (a) { return a < 50 || a > 130; })) return 'winkel';
    var kurz = Math.min.apply(null, g.q.map(function (p, k) { var r2 = g.q[(k + 1) % 4]; return Math.hypot(r2[0] - p[0], r2[1] - p[1]); }));
    if (kurz < Math.min(w, h) * 0.08) return 'schmal';
    return null;
  }
  ZS.finden = function (img) {
    var w = img.width, h = img.height, n = w * h, d = img.data, i, j;
    var wert = new Float32Array(n);
    for (i = 0, j = 0; i < n; i++, j += 4) {
      var r = d[j], g = d[j + 1], b = d[j + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      wert[i] = 0.299 * r + 0.587 * g + 0.114 * b - 1.2 * (mx - mn);
    }
    var rad = Math.max(1, Math.round(Math.max(w, h) / 220));
    wert = boxBlur(boxBlur(wert, w, h, rad), w, h, rad);
    var o = otsu(wert);
    if (o.trennung < 0.4) return { ecken: null, grund: 'kontrast', trennung: o.trennung };

    /* 1. helles, ungesättigtes Papier: größte zusammenhängende Fläche */
    var maske = new Uint8Array(n);
    for (i = 0; i < n; i++) maske[i] = wert[i] > o.schwelle ? 1 : 0;
    var lab = new Int32Array(n), stack = new Int32Array(n), groesste = 0, bestLab = 0, nr = 0;
    for (i = 0; i < n; i++) {
      if (!maske[i] || lab[i]) continue;
      nr++; var sp = 0, cnt = 0; stack[sp++] = i; lab[i] = nr;
      while (sp) {
        var p = stack[--sp], x = p % w; cnt++;
        if (x > 0 && maske[p - 1] && !lab[p - 1]) { lab[p - 1] = nr; stack[sp++] = p - 1; }
        if (x < w - 1 && maske[p + 1] && !lab[p + 1]) { lab[p + 1] = nr; stack[sp++] = p + 1; }
        if (p >= w && maske[p - w] && !lab[p - w]) { lab[p - w] = nr; stack[sp++] = p - w; }
        if (p < n - w && maske[p + w] && !lab[p + w]) { lab[p + w] = nr; stack[sp++] = p + w; }
      }
      if (cnt > groesste) { groesste = cnt; bestLab = nr; }
    }
    if (groesste < n * 0.05) return { ecken: null, grund: 'klein' };
    /* liegt in der Bildmitte eine genügend große helle Fläche, nimm diese (man zielt auf den Beleg) */
    var groessen = new Int32Array(nr + 1), mitte = {}, mm = 0, mLab = 0;
    for (i = 0; i < n; i++) if (lab[i]) groessen[lab[i]]++;
    var r9 = Math.max(2, Math.round(Math.min(w, h) * 0.02)), mx0 = w >> 1, my0 = h >> 1;
    for (var yy = my0 - r9; yy <= my0 + r9; yy++) for (var xx = mx0 - r9; xx <= mx0 + r9; xx++) {
      var lb = lab[yy * w + xx]; if (!lb) continue;
      mitte[lb] = (mitte[lb] || 0) + 1; if (mitte[lb] > mm) { mm = mitte[lb]; mLab = lb; }
    }
    if (mLab && groessen[mLab] >= n * 0.05) bestLab = mLab;
    var papier = new Uint8Array(n);
    for (i = 0; i < n; i++) papier[i] = lab[i] === bestLab ? 1 : 0;
    papier = fuellen(papier, w, h);
    var gA = gebiet(papier, w, h), fehlerA = pruefen(gA, w, h);
    var info = gA ? { trennung: o.trennung, anteil: gA.anteil, fuellung: gA.fuellung, rechteck: gA.rechteck, raender: gA.raender } : { trennung: o.trennung };
    if (fehlerA) return Object.assign({ ecken: null, grund: fehlerA }, info);

    /* 2. dunkle Teile am Belegrand (z. B. schwarzer Kopf mit Logo) dazunehmen,
          wenn sie sich farblich vom Hintergrund unterscheiden. Hintergrundfarben vom Bildrand. */
    var H = new Uint32Array(4096), proben = 0, bw = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    function bin(k) { return ((d[k] >> 4) << 8) | ((d[k + 1] >> 4) << 4) | (d[k + 2] >> 4); }
    for (i = 0; i < n; i++) {
      var ix = i % w, iy = (i / w) | 0;
      if (papier[i] || (ix >= bw && iy >= bw && ix < w - bw && iy < h - bw)) continue;
      H[bin(i * 4)]++; proben++;
    }
    var gB = null;
    if (proben > 50) {
      var grenze = proben * 0.004, hg = new Uint8Array(4096);
      for (var bb = 0; bb < 4096; bb++) {
        var r0 = bb >> 8, g0 = (bb >> 4) & 15, b0 = bb & 15, s = 0;
        for (var dr = -1; dr <= 1; dr++) for (var dg = -1; dg <= 1; dg++) for (var db = -1; db <= 1; db++) {
          var r1 = r0 + dr, g1 = g0 + dg, b1 = b0 + db;
          if (r1 >= 0 && r1 < 16 && g1 >= 0 && g1 < 16 && b1 >= 0 && b1 < 16) s += H[(r1 << 8) | (g1 << 4) | b1];
        }
        hg[bb] = s >= grenze ? 1 : 0;
      }
      var mehr = papier.slice(), sp3 = 0, dazu = 0;
      for (i = 0; i < n; i++) if (papier[i]) stack[sp3++] = i;
      while (sp3) {
        var c = stack[--sp3], cx = c % w, nb = [cx > 0 ? c - 1 : -1, cx < w - 1 ? c + 1 : -1, c >= w ? c - w : -1, c < n - w ? c + w : -1];
        for (var t = 0; t < 4; t++) {
          var z = nb[t];
          if (z < 0 || mehr[z] || hg[bin(z * 4)]) continue;
          mehr[z] = 1; stack[sp3++] = z; dazu++;
        }
      }
      if (dazu > n * 0.002) {
        gB = gebiet(fuellen(mehr, w, h), w, h);
        if (pruefen(gB, w, h) || gB.anteil > gA.anteil * 1.6) gB = null;
      }
    }
    var g2 = gB || gA, q4 = g2.q;
    info.erweitert = !!gB;

    /* etwas Rand lassen, damit nichts abgeschnitten wird */
    var mx2 = 0, my2 = 0; q4.forEach(function (p) { mx2 += p[0] / 4; my2 += p[1] / 4; });
    q4 = q4.map(function (p) {
      var dx = p[0] - mx2, dy = p[1] - my2, l = Math.hypot(dx, dy) || 1, f = 1 + Math.max(1.5, l * 0.012) / l;
      return [Math.max(0, Math.min(w, mx2 + dx * f)), Math.max(0, Math.min(h, my2 + dy * f))];
    });
    return Object.assign({ ecken: q4 }, info);
  };

  /* ---------- Perspektive entzerren ---------- */
  function homographie(von, nach) {
    var A = [], B = [], i;
    for (i = 0; i < 4; i++) {
      var x = von[i][0], y = von[i][1], u = nach[i][0], v = nach[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
    }
    for (var c = 0; c < 8; c++) {
      var piv = c; for (i = c + 1; i < 8; i++) if (Math.abs(A[i][c]) > Math.abs(A[piv][c])) piv = i;
      var t = A[c]; A[c] = A[piv]; A[piv] = t; t = B[c]; B[c] = B[piv]; B[piv] = t;
      for (i = c + 1; i < 8; i++) { var f = A[i][c] / A[c][c]; for (var k = c; k < 8; k++) A[i][k] -= f * A[c][k]; B[i] -= f * B[c]; }
    }
    var hv = new Array(8);
    for (i = 7; i >= 0; i--) { var s = B[i]; for (var k2 = i + 1; k2 < 8; k2++) s -= A[i][k2] * hv[k2]; hv[i] = s / A[i][i]; }
    return hv.concat(1);
  }
  ZS.groesse = function (q, max) {
    function l(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
    var W = Math.max(l(q[0], q[1]), l(q[3], q[2])), H = Math.max(l(q[0], q[3]), l(q[1], q[2])), f = Math.min(1, (max || 2200) / Math.max(W, H));
    return { w: Math.max(1, Math.round(W * f)), h: Math.max(1, Math.round(H * f)) };
  };
  /* src: ImageData in voller Auflösung, q: Ecken in src-Koordinaten, out: {width,height,data} */
  ZS.entzerren = function (src, q, out) {
    var W = out.width, H = out.height, sw = src.width, sh = src.height, s = src.data, o = out.data;
    var m = homographie([[0, 0], [W, 0], [W, H], [0, H]], q);
    for (var y = 0; y < H; y++) {
      var yy = y + 0.5;
      for (var x = 0; x < W; x++) {
        var xx = x + 0.5, z = m[6] * xx + m[7] * yy + 1;
        var u = (m[0] * xx + m[1] * yy + m[2]) / z - 0.5, v = (m[3] * xx + m[4] * yy + m[5]) / z - 0.5;
        if (u < 0) u = 0; if (v < 0) v = 0; if (u > sw - 1.001) u = sw - 1.001; if (v > sh - 1.001) v = sh - 1.001;
        var x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i0 = (y0 * sw + x0) * 4, i1 = i0 + sw * 4, k = (y * W + x) * 4;
        for (var c = 0; c < 3; c++) {
          var a = s[i0 + c] + (s[i0 + 4 + c] - s[i0 + c]) * fx, b = s[i1 + c] + (s[i1 + 4 + c] - s[i1 + c]) * fx;
          o[k + c] = a + (b - a) * fy;
        }
        o[k + 3] = 255;
      }
    }
    return out;
  };
  /* Papier aufhellen, Schrift kräftiger (sanft, höchstens 2,2-fach) */
  ZS.aufhellen = function (img) {
    var d = img.data, n = d.length / 4, hist = new Uint32Array(256), i, cnt = 0;
    for (i = 0; i < n; i += 3) { var k = i * 4; hist[(0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) | 0]++; cnt++; }
    function perz(p) { var z = 0, ziel = cnt * p; for (var t = 0; t < 256; t++) { z += hist[t]; if (z >= ziel) return t; } return 255; }
    var schwarz = perz(0.01), weiss = perz(0.85);
    if (weiss - schwarz < 60) return img;
    var gain = Math.min(2.2, 250 / (weiss - schwarz)), off = schwarz * 0.6;
    if (gain < 1.05 && off < 4) return img;
    var lut = new Uint8ClampedArray(256);
    for (i = 0; i < 256; i++) lut[i] = (i - off) * gain;
    for (i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    return img;
  };

  root.ZS = ZS;

  /* ---------- Im Browser: Datei rein, zugeschnittene Datei raus ---------- */
  var APP = root.APP;
  if (!APP || typeof document === 'undefined') return;
  APP.zuschnittAn = function () { try { return localStorage.getItem('s1tax:zuschnitt') !== '0'; } catch (e) { return true; } };
  function laden(file) {
    if (root.createImageBitmap) return createImageBitmap(file).catch(function () { return bild(file); });
    return bild(file);
  }
  function bild(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () { URL.revokeObjectURL(u); res(img); };
      img.onerror = function () { URL.revokeObjectURL(u); rej(new Error('Bild nicht lesbar')); };
      img.src = u;
    });
  }
  /* Ergebnis: {datei, original, zugeschnitten, info} – bei Problemen immer das Original */
  APP.zuschneiden = function (file) {
    var ohne = function (grund) { return { datei: file, original: file, zugeschnitten: false, grund: grund }; };
    if (!file || !/^image\/(jpe?g|png|webp)/.test(file.type || '')) return Promise.resolve(ohne('typ'));
    return laden(file).then(function (img) {
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var f = Math.min(1, 2600 / Math.max(iw, ih)), sw = Math.round(iw * f), sh = Math.round(ih * f);
      var c = document.createElement('canvas'); c.width = sw; c.height = sh;
      var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, sw, sh);
      if (img.close) img.close();
      var k = Math.min(1, 520 / Math.max(sw, sh)), kw = Math.round(sw * k), kh = Math.round(sh * k);
      var kc = document.createElement('canvas'); kc.width = kw; kc.height = kh;
      var kg = kc.getContext('2d', { willReadFrequently: true }); kg.drawImage(c, 0, 0, kw, kh);
      var r = ZS.finden(kg.getImageData(0, 0, kw, kh));
      if (!r.ecken) return ohne(r.grund);
      var q = r.ecken.map(function (p) { return [p[0] * sw / kw, p[1] * sh / kh]; });
      var gr = ZS.groesse(q, 2200), oc = document.createElement('canvas'); oc.width = gr.w; oc.height = gr.h;
      var og = oc.getContext('2d'), out = og.createImageData(gr.w, gr.h);
      ZS.entzerren(g.getImageData(0, 0, sw, sh), q, out);
      ZS.aufhellen(out);
      og.putImageData(out, 0, 0);
      return new Promise(function (res) { oc.toBlob(res, 'image/jpeg', 0.85); }).then(function (b) {
        if (!b) return ohne('speichern');
        var name = String(file.name || 'Foto.jpg').replace(/\.[a-z0-9]+$/i, '') + '.jpg';
        var neu; try { neu = new File([b], name, { type: 'image/jpeg' }); } catch (e) { neu = b; neu.name = name; }
        return { datei: neu, original: file, zugeschnitten: true, info: r, ecken: q.map(function (p) { return [p[0] / f, p[1] / f]; }) };
      });
    }).catch(function (e) { return ohne('fehler: ' + (e && e.message || e)); });
  };
})(typeof window !== 'undefined' ? window : globalThis);
