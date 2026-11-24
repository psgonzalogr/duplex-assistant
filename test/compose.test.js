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
  // 3 páginas: la hoja de la pág. 3 de cada copia pasa sin reverso (lo avisa la pantalla de reversos)
  assert.equal(job.lastPage, 3);
  assert.equal(job.batches[0].blankBacks, 3);
});

test('lotes por capacidad de bandeja', async () => {
  const pdf = await samplePdf(4);
  const job = await c.buildJob(pdf, { copies: 5, capacity: 4, invert: false, outDir: path.join(path.dirname(pdf), 'o2') });
  assert.deepEqual(job.batches.map((x) => x.sheets), [4, 4, 2]);
  assert.deepEqual(job.batches.map((x) => x.blankBacks), [0, 0, 0]);
});

test('orden de reversos según el movimiento del mazo', () => {
  // Caso real (Brother DCP-T710W): sale con lo impreso a la vista y la flecha hacia uno; se gira sobre la mesa.
  // La última hoja queda arriba y entra primero → hay que invertir (si no, detrás de la pág. 1 sale la 6).
  const brother = { outputFace: 'up-out', faceUp: true, invert: false, invertFix: false };
  assert.equal(c.effectiveInvert(brother), true);
  assert.equal(c.effectiveInvert({ outputFace: 'up-in', faceUp: true }), true);    // solo trasladar
  assert.equal(c.effectiveInvert({ outputFace: 'up-in', faceUp: false }), false);  // dar vuelta (libro)
  assert.equal(c.effectiveInvert({ outputFace: 'down', faceUp: true }), false);    // dar vuelta (libro)
  assert.equal(c.effectiveInvert({ outputFace: 'up-out', faceUp: false }), false); // dar vuelta (calendario)
  assert.equal(c.effectiveInvert({ outputFace: 'down', faceUp: false }), true);    // solo trasladar
  // La calibración puede corregir una impresora que se comporta distinto
  assert.equal(c.effectiveInvert({ ...brother, invertFix: true }), false);
  // Sin saber cómo salen las hojas, manda lo que dijo la calibración
  assert.equal(c.effectiveInvert({ outputFace: null, invert: true }), true);
  // Orden real enviado: 6 págs., 1 copia, invertido → la hoja 1 recibe la 2 al final del mazo de reversos
  const s = c.planSheets([0, 1, 2, 3, 4, 5], 1);
  assert.deepEqual(c.backOrder(s, true).map((i) => i + 1), [6, 4, 2]);
});

test('calibración', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'da-cal-'));
  const cal = await c.buildCalibration(dir);
  assert.equal((await PDFDocument.load(await fs.readFile(cal.fronts))).getPageCount(), 2);
  assert.deepEqual(c.calibrationFromAnswer('swapped'), { invert: true, rotate: false });
  assert.equal(c.calibrationFromAnswer('same-side'), null);
});
