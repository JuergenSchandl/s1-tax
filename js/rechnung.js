/* S1 Tax · Ausgangsrechnung als PDF im Layout von Jürgens Word-Vorlage
   Logo und Briefkopf oben, Kundenblock, Tabelle mit Rechnungsdaten und Positionen,
   Summen, Zahlungsziel, Bankverbindung und Fußzeile mit Firmenbuch und UID.
   Fett geschriebene Stellen im Positionstext werden mit **…** markiert. */
(function (root) {
  'use strict';
  var A4 = [595.28, 841.89], ML = 58, MR = 537;
  var GRAU = [0.45, 0.45, 0.45], SCHWARZ = [0.08, 0.08, 0.1], LINIE = [0.55, 0.62, 0.78], KOPF = [0.86, 0.9, 0.96];

  function clean(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[−]/g, '-').replace(/[\u2009\u202F\u00A0]/g, ' ').replace(/[\u2028\u2029]/g, '\n')
      .replace(/[^\n\x20-\x7E\u00A0-ÿ€–—‘’‚“”„•…]/g, '');
  }
  function eur(v) {
    var x = Math.round((Number(v) || 0) * 100) / 100, s = Math.abs(x).toFixed(2).split('.');
    return (x < 0 ? '-' : '') + '€ ' + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1];
  }
  function datum(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function menge(v) { var n = Number(v) || 0; return (Math.round(n * 100) / 100).toString().replace('.', ','); }

  /* Text mit **fett** in Wörter zerlegen und auf Breite umbrechen */
  function segments(text) {
    var out = [], bold = false;
    clean(text).split('**').forEach(function (part, i) {
      if (i > 0) bold = !bold;
      part.split(/(\n)/).forEach(function (p) {
        if (p === '\n') { out.push({ nl: true }); return; }
        p.split(/(\s+)/).forEach(function (w) { if (w) out.push({ t: w, b: bold }); });
      });
    });
    return out;
  }
  function wrap(text, width, size, F) {
    var lines = [[]], w = 0;
    segments(text).forEach(function (s) {
      if (s.nl) { lines.push([]); w = 0; return; }
      var f = s.b ? F.bold : F.reg, sw = f.widthOfTextAtSize(s.t, size);
      var line = lines[lines.length - 1];
      if (/^\s+$/.test(s.t)) { if (line.length) { line.push(s); w += sw; } return; }
      if (w + sw > width && line.length) {
        while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop();
        lines.push([]); line = lines[lines.length - 1]; w = 0;
      }
      line.push(s); w += sw;
    });
    return lines;
  }
  function drawLines(page, lines, x, y, size, lh, F, color) {
    lines.forEach(function (line, i) {
      var cx = x;
      line.forEach(function (s) {
        var f = s.b ? F.bold : F.reg;
        page.drawText(s.t, { x: cx, y: y - i * lh, size: size, font: f, color: color });
        cx += f.widthOfTextAtSize(s.t, size);
      });
    });
    return lines.length * lh;
  }

  async function pdf(a, firma, logoBytes) {
    var PL = root.PDFLib, doc = await PL.PDFDocument.create();
    doc.setTitle('Rechnung ' + (a.nr || 'Entwurf'));
    doc.setAuthor(clean(firma.name || 'S1 Secure e.U.'));
    doc.setCreator('S1 Tax');
    var F = { reg: await doc.embedFont(PL.StandardFonts.Helvetica), bold: await doc.embedFont(PL.StandardFonts.HelveticaBold) };
    var logo = null;
    if (logoBytes) { try { logo = await doc.embedPng(logoBytes); } catch (e) { try { logo = await doc.embedJpg(logoBytes); } catch (e2) { logo = null; } } }
    var rgb = function (c) { return PL.rgb(c[0], c[1], c[2]); };
    var pages = [], page, y;

    function kopf(p) {
      if (logo) { var w = 78, h = w * logo.height / logo.width; p.drawImage(logo, { x: ML, y: A4[1] - 30 - h, width: w, height: h }); }
      var r = [firma.ort, firma.strasse, 'T: ' + (firma.tel || ''), 'M: ' + (firma.mail || '')];
      r.forEach(function (t, i) { t = clean(t); p.drawText(t, { x: MR - F.reg.widthOfTextAtSize(t, 7.5), y: A4[1] - 34 - i * 9.5, size: 7.5, font: F.reg, color: rgb(GRAU) }); });
    }
    function fuss(p) {
      var y0 = 92;
      p.drawLine({ start: { x: ML, y: y0 }, end: { x: MR, y: y0 }, thickness: 0.6, color: rgb(LINIE) });
      if (logo) { var w = 58, h = w * logo.height / logo.width; p.drawImage(logo, { x: ML, y: y0 - 12 - h, width: w, height: h }); }
      var mitte = [[firma.name, true], [firma.strasse], [firma.ort], [firma.fn]];
      mitte.forEach(function (z, i) { var t = clean(z[0]), f = z[1] ? F.bold : F.reg; p.drawText(t, { x: 297 - f.widthOfTextAtSize(t, 7) / 2, y: y0 - 12 - i * 9, size: 7, font: f, color: rgb(GRAU) }); });
      var rechts = [firma.tel_fuss || firma.tel, firma.mail, firma.web, firma.uid];
      rechts.forEach(function (z, i) { var t = clean(z); p.drawText(t, { x: MR - F.reg.widthOfTextAtSize(t, 7), y: y0 - 12 - i * 9, size: 7, font: F.reg, color: rgb(GRAU) }); });
    }
    function neueSeite() {
      page = doc.addPage(A4); pages.push(page); kopf(page); fuss(page);
      y = A4[1] - 110;
    }
    function platz(h) { if (y - h < 110) { neueSeite(); y = A4[1] - 110; } }
    function text(t, x, size, bold, color) { page.drawText(clean(t), { x: x, y: y, size: size, font: bold ? F.bold : F.reg, color: rgb(color || SCHWARZ) }); }

    neueSeite();
    var e = a.empfaenger || {};
    y = A4[1] - 118;
    [[e.name1, true], [e.name2, !!e.name2Bold], [e.strasse], [e.ort, true]].forEach(function (z) {
      if (!z[0]) return; text(z[0], ML, 10, z[1]); y -= 13;
    });
    if (e.mail) { y -= 2; text('Per E-Mail an:', ML, 10); text(e.mail, ML + 92, 10); y -= 13; }
    y -= 8;
    var seiteY = y;
    y -= 24;
    text('Wie vereinbart, dürfen wir Ihnen wie folgt in Rechnung stellen:', ML, 10);
    y -= 18;

    /* Tabelle */
    var col = [ML, ML + 28, ML + 222, ML + 270, ML + 355, MR];
    var info = [['Rechnungsnummer', a.nr || 'Entwurf', true], ['Rechnungsdatum', datum(a.datum)], ['Bestellnummer', e.bestellnr || '', true], ['Ansprechpartner', e.ansprech || '', false, e.uid ? 'Ihre UID Nr.: ' + e.uid : '']];
    var ix = [ML, ML + 102, ML + 210, MR];
    function rahmen(x1, yTop, x2, yBot, fill) {
      if (fill) page.drawRectangle({ x: x1, y: yBot, width: x2 - x1, height: yTop - yBot, color: rgb(fill) });
      page.drawRectangle({ x: x1, y: yBot, width: x2 - x1, height: yTop - yBot, borderColor: rgb(SCHWARZ), borderWidth: 0.5 });
    }
    info.forEach(function (r) {
      var h = 15;
      rahmen(ix[0], y + 11, ix[1], y + 11 - h); rahmen(ix[1], y + 11, ix[2], y + 11 - h); rahmen(ix[2], y + 11, ix[3], y + 11 - h);
      text(r[0], ix[0] + 3, 9.5, true); text(r[1], ix[1] + 3, 9.5, !!r[2]); if (r[3]) text(r[3], ix[2] + 3, 9.5);
      y -= h;
    });
    /* Kopf der Positionen */
    var hh = 24;
    var heads = ['Pos:', 'Beschreibung', a.mengeLabel || 'Menge', 'Einzelpreis netto (Euro)', 'Gesamtpreis netto (Euro)'];
    for (var c = 0; c < 5; c++) rahmen(col[c], y + 11, col[c + 1], y + 11 - hh, KOPF);
    heads.forEach(function (h, i) {
      var lines = wrap(h, col[i + 1] - col[i] - 6, 9, F);
      lines.forEach(function (l) { l.forEach(function (s) { s.b = true; }); });
      drawLines(page, lines, col[i] + 3, y, 9, 10.5, F, rgb(SCHWARZ));
    });
    y -= hh;
    var pos = (a.positionen || []).filter(function (p) { return p && (p.text || Number(p.preis || p.ep)); });
    pos.forEach(function (p, i) {
      var preis = Number(p.preis !== undefined ? p.preis : p.ep) || 0, m = Number(p.menge) || 0;
      var lines = wrap(p.text || '', col[2] - col[1] - 8, 10, F);
      var h = Math.max(1, lines.length) * 12.5 + 8;
      if (y - h < 120) { neueSeite(); y = A4[1] - 130; }
      for (var c2 = 0; c2 < 5; c2++) rahmen(col[c2], y + 11, col[c2 + 1], y + 11 - h);
      text((i + 1 < 10 ? '0' : '') + (i + 1), col[0] + 3, 10);
      drawLines(page, lines, col[1] + 3, y, 10, 12.5, F, rgb(SCHWARZ));
      var ms = menge(m); page.drawText(ms, { x: col[3] - 6 - F.reg.widthOfTextAtSize(ms, 10), y: y, size: 10, font: F.reg, color: rgb(SCHWARZ) });
      var ep = eur(preis); page.drawText(ep, { x: col[4] - 4 - F.reg.widthOfTextAtSize(ep, 10), y: y, size: 10, font: F.reg, color: rgb(SCHWARZ) });
      var gp = eur(Math.round(m * preis * 100) / 100); page.drawText(gp, { x: col[5] - 4 - F.reg.widthOfTextAtSize(gp, 10), y: y, size: 10, font: F.reg, color: rgb(SCHWARZ) });
      y -= h;
    });
    function summe(label, wert, bold, h) {
      platz(h + 4);
      rahmen(ML, y + 11, MR, y + 11 - h);
      text(label, ML + 3, 10, bold);
      var w = eur(wert), f = bold ? F.bold : F.reg;
      page.drawText(w, { x: MR - 4 - f.widthOfTextAtSize(w, 10), y: y, size: 10, font: f, color: rgb(SCHWARZ) });
      y -= h;
    }
    summe('Summe (netto)', a.netto, false, 16);
    summe('zzgl. ' + String(a.satz || 20) + '% USt', a.ust, false, 16);
    summe('Gesamtbetrag (brutto)', a.brutto, true, 17);
    y -= 22;
    platz(70);
    text('Zahlbar (brutto) ohne Abzüge binnen ' + (Number(a.ziel) || 14) + ' Tagen ab Rechnungserhalt', ML, 10);
    if (a.zusatz) { y -= 16; drawLines(page, wrap(a.zusatz, MR - ML, 10, F), ML, y, 10, 12.5, F, rgb(SCHWARZ)); }
    y -= 26;
    text('Bankverbindung', ML, 10);
    y -= 14;
    var bank = 'Inhaber: ' + (firma.inhaber || '') + '  |  Bank ' + (firma.bank || '') + '  |  IBAN: ' + (firma.iban || '…') + '  |  BIC: ' + (firma.bic || '');
    drawLines(page, wrap(bank, MR - ML, 10, F), ML, y, 10, 12.5, F, rgb(SCHWARZ));

    pages.forEach(function (p, i) {
      var t = 'Seite ' + (i + 1) + '/' + pages.length;
      p.drawText(t, { x: MR - F.reg.widthOfTextAtSize(t, 10), y: i === 0 ? seiteY : A4[1] - 110, size: 10, font: F.reg, color: rgb(SCHWARZ) });
    });
    return doc.save();
  }

  /* Positionen einer Vorlage mit den Feldern des Formulars füllen */
  function fuellen(text, felder) {
    return String(text || '').replace(/\{(\w+)\}/g, function (all, k) {
      var v = felder[k];
      if (!v) return '…';
      return k === 'termine' ? v : '**' + v + '**';
    }).split('** bis **').join(' bis ');
  }
  function summen(pos, satz) {
    var netto = Math.round(pos.reduce(function (n, p) { return n + Math.round((Number(p.menge) || 0) * (Number(p.preis !== undefined ? p.preis : p.ep) || 0) * 100) / 100; }, 0) * 100) / 100;
    var ust = Math.round(netto * (satz === undefined ? 20 : satz)) / 100;
    return { netto: netto, ust: ust, brutto: Math.round((netto + ust) * 100) / 100 };
  }

  var api = { pdf: pdf, fuellen: fuellen, summen: summen, clean: clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rechnung = api;
})(typeof window !== 'undefined' ? window : globalThis);
