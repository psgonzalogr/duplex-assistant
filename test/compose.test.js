'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const c = require('../src/main/compose');

test('parseRange', () => {
  assert.deepEqual(c.parseRange('', 4), [0, 1, 2, 3]);
  assert.deepEqual(c.parseRange('1-3, 5', 6), [0, 1, 2, 4]);
  assert.deepEqual(c.parseRange('4-', 6), [3, 4, 5]);
  assert.deepEqual(c.parseRange('3-1', 6), [2, 1, 0]);
  assert.throws(() => c.parseRange('9', 3), /no existe/);
  assert.throws(() => c.parseRange('abc', 3), /No entiendo/);
});

test('planSheets rellena con blanco cuando las páginas son impares', () => {
  const s = c.planSheets([0, 1, 2], 2);
  assert.deepEqual(s.map((x) => [x.copy, x.front, x.back]), [[1, 0, 1], [1, 2, null], [2, 0, 1], [2, 2, null]]);
});

test('backOrder invierte por lote', () => {
  const s = c.planSheets([0, 1, 2, 3], 2); // 4 hojas
  const [b1, b2] = c.splitBatches(s, 3);
  assert.equal(b1.length, 3); assert.equal(b2.length, 1);
  assert.deepEqual(c.backOrder(b1, true), [1, 3, 1]);
  assert.deepEqual(c.backOrder(b1, false), [1, 3, 1].reverse().reverse());
});

async function samplePdf(n) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) d.addPage([612, 792]).drawText(`PAG ${i}`, { x: 100, y: 400, size: 40, font: f });
  const p = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'da-')), 'doc.pdf');
  await fs.writeFile(p, await d.save());
  return p;
}

test('buildJob genera frentes y reversos con las páginas correctas', async () => {
  const pdf = await samplePdf(3);
  const outDir = path.join(path.dirname(pdf), 'out');
  const job = await c.buildJob(pdf, { copies: 3, capacity: 100, invert: true, rotate: true, outDir });
  assert.equal(job.totalSheets, 6);
  assert.equal(job.batches.length, 1);
  const f = await PDFDocument.load(await fs.readFile(job.batches[0].fronts));
  const b = await PDFDocument.load(await fs.readFile(job.batches[0].backs));
  assert.equal(f.getPageCount(), 6);
  assert.equal(b.getPageCount(), 6);
  assert.equal(b.getPage(0).getRotation().angle, 180);
});

test('lotes por capacidad de bandeja', async () => {
  const pdf = await samplePdf(4);
  const job = await c.buildJob(pdf, { copies: 5, capacity: 4, invert: false, outDir: path.join(path.dirname(pdf), 'o2') });
  assert.deepEqual(job.batches.map((x) => x.sheets), [4, 4, 2]);
});

test('calibración', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'da-cal-'));
  const cal = await c.buildCalibration(dir);
  assert.equal((await PDFDocument.load(await fs.readFile(cal.fronts))).getPageCount(), 2);
  assert.deepEqual(c.calibrationFromAnswer('swapped'), { invert: true, rotate: false });
  assert.equal(c.calibrationFromAnswer('same-side'), null);
});
