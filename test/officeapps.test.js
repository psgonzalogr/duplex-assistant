'use strict';
// findExported: solo acepta el PDF con el mismo nombre del documento (o las variantes que agregan los programas).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

// officeapps.js pide electron (shell) y craft.js; aquí basta un reemplazo mínimo
const realLoad = Module._load;
Module._load = (req, ...rest) => (req === 'electron' ? { shell: {} } : realLoad(req, ...rest));
const { findExported } = require('../src/main/officeapps');
Module._load = realLoad;

const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 32), Buffer.from('\n%%EOF\n')]);

test('findExported acepta el mismo nombre y variantes numeradas, no otros PDF', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'da-oa-'));
  const doc = path.join(dir, 'Informe (v2).docx');
  fs.writeFileSync(doc, 'x');
  const since = Date.now() - 1000;
  fs.writeFileSync(path.join(dir, 'Informe (v2) final.pdf'), pdf);
  fs.writeFileSync(path.join(dir, 'Informe.pdf'), pdf);
  assert.equal(findExported(doc, since), null);
  fs.writeFileSync(path.join(dir, 'Informe (v2) (1).pdf'), pdf);
  assert.equal(path.basename(findExported(doc, since).path), 'Informe (v2) (1).pdf');
  fs.writeFileSync(path.join(dir, 'informe (v2).PDF'), pdf);
  const f = findExported(doc, since);
  assert.match(path.basename(f.path), /^Informe \(v2\)( \(1\))?\.pdf$/i);
});
