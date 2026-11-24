// Abre la app en modo autoprueba y guarda capturas de cada pantalla en selftest-out/.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electron = require('electron');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const doc = await PDFDocument.create();
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const reg = await doc.embedFont(StandardFonts.Helvetica);
const titles = ['Guía de ejercicios', 'Parte 1: Conceptos', 'Parte 2: Problemas', 'Parte 3: Respuestas', 'Anexo'];
titles.forEach((t, i) => {
  const p = doc.addPage([612, 792]);
  p.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: rgb(0.86, 0.15, 0.15) });
  p.drawText(`Página ${i + 1}`, { x: 40, y: 760, size: 14, font: bold, color: rgb(1, 1, 1) });
  p.drawText(t, { x: 40, y: 680, size: 30, font: bold, color: rgb(0.07, 0.11, 0.18) });
  for (let l = 0; l < 22; l++) {
    p.drawRectangle({ x: 40, y: 630 - l * 24, width: 300 + ((l * 73) % 230), height: 8, color: rgb(0.75, 0.77, 0.8) });
  }
  p.drawText(`${i + 1}`, { x: 300, y: 40, size: 12, font: reg });
});
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'da-selftest-'));
const sample = path.join(dir, 'Guía de ejercicios.pdf');
await fs.writeFile(sample, await doc.save());

const out = path.resolve('selftest-out');
await fs.rm(out, { recursive: true, force: true });
const env = { ...process.env, DA_SELFTEST: sample, DA_SELFTEST_OUT: out };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { stdio: 'inherit', env });
const timer = setTimeout(() => { console.error('selftest: tiempo agotado'); child.kill(); process.exit(1); }, 240000);
child.on('close', async (code) => {
  clearTimeout(timer);
  const files = await fs.readdir(out).catch(() => []);
  console.log(`selftest: ${files.length} capturas en ${out}`);
  process.exit(code ?? 0);
});
