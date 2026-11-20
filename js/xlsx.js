/* S1 Tax · Excel-Dateien schreiben (für CNC und die Rechnungsnummern-Liste)
   Kleine eigene Lösung auf Basis von JSZip: Zahlen, Texte, Datum, Formeln,
   Spaltenbreiten, fixierte erste Zeile und die Zahlenformate aus Jürgens Vorlagen. */
(function (root) {
  'use strict';
  var STYLES = { normal: 0, fett: 1, datum: 2, buch: 3, euro: 4, text: 5, buchFett: 6, euroFett: 7, zahl: 8, gelb: 9, datumFett: 10 };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; })
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function serial(v) {
    var y, m, d;
    if (v instanceof Date) { y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate(); }
    else { var p = String(v).slice(0, 10).split('-'); y = +p[0]; m = +p[1]; d = +p[2]; }
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function cellXml(ref, c) {
    if (c === null || c === undefined || c === '') return '';
    if (typeof c !== 'object' || c instanceof Date) c = { v: c };
    var s = STYLES[c.s] || 0, attr = ' r="' + ref + '"' + (s ? ' s="' + s + '"' : '');
    if (c.f) return '<c' + attr + '><f>' + esc(String(c.f).replace(/^=/, '')) + '</f></c>';
    var v = c.v;
    if (v === null || v === undefined || v === '') return s ? '<c' + attr + '/>' : '';
    if (c.t === 'd' || v instanceof Date) {
      if (!s) attr += ' s="2"';
      return '<c' + attr + '><v>' + serial(v) + '</v></c>';
    }
    if (typeof v === 'number' && c.t !== 's') return isFinite(v) ? '<c' + attr + '><v>' + v + '</v></c>' : '';
    return '<c' + attr + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function sheetXml(sh) {
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    if (sh.freeze) {
      var m = sh.freeze.match(/^([A-Z]+)(\d+)$/), row = Number(m[2]) - 1;
      x += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + row + '" topLeftCell="' + sh.freeze + '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="' + sh.freeze + '" sqref="' + sh.freeze + '"/></sheetView></sheetViews>';
    } else x += '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    x += '<sheetFormatPr defaultRowHeight="15"/>';
    if (sh.cols && sh.cols.length) {
      x += '<cols>';
      sh.cols.forEach(function (w, i) { if (w) x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; });
      x += '</cols>';
    }
    x += '<sheetData>';
    (sh.rows || []).forEach(function (r, ri) {
      if (!r) return;
      var cells = '';
      r.forEach(function (c, ci) { cells += cellXml(colName(ci) + (ri + 1), c); });
      if (cells) x += '<row r="' + (ri + 1) + '">' + cells + '</row>';
    });
    x += '</sheetData><pageMargins left="0.7" right="0.7" top="0.78" bottom="0.78" header="0.3" footer="0.3"/></worksheet>';
    return x;
  }

  var STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="_-* #,##0.00_-;\\-* #,##0.00_-;_-* &quot;-&quot;??_-;_-@_-"/><numFmt numFmtId="165" formatCode="&quot;€&quot;\\ #,##0.00"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="11">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>' +
    '<xf numFmtId="14" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  /* sheets: [{name, cols:[Breiten], freeze:'A2', rows:[[Zelle,…],…]}] → Promise<Blob> */
  function build(sheets, type) {
    var zip = new root.JSZip(), names = [];
    sheets.forEach(function (sh, i) {
      var n = String(sh.name || ('Blatt' + (i + 1))).replace(/[\\\/?*\[\]:]/g, '-').slice(0, 31);
      while (names.indexOf(n) >= 0) n = n.slice(0, 28) + ' ' + (i + 1);
      names.push(n);
    });
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' +
      names.map(function (n, i) { return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names.map(function (n, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.file('xl/styles.xml', STYLES_XML);
    sheets.forEach(function (sh, i) { zip.file('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(sh)); });
    return zip.generateAsync({ type: type || 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  }

  var api = { build: build, colName: colName, serial: serial };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XLSXW = api;
})(typeof window !== 'undefined' ? window : globalThis);
