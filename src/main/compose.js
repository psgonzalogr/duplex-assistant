'use strict';
// Arma el orden de las hojas para dúplex manual y genera los PDF de frentes y reversos.
const fs = require('node:fs/promises');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');

/**
 * Interpreta un rango como "1-3, 5, 8-" (1-based). Vacío = todas.
 * Devuelve índices 0-based en el orden escrito, sin duplicados contiguos inválidos.
 */
function parseRange(spec, total) {
  const all = Array.from({ length: total }, (_, i) => i);
  if (!spec || !String(spec).trim()) return all;
  const out = [];
  for (const raw of String(spec).split(/[,;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    if (m) {
      const a = m[1] ? parseInt(m[1], 10) : 1;
      const b = m[2] ? parseInt(m[2], 10) : total;
      if (a < 1 || b < 1 || a > total || b > total) throw new RangeError(`El rango «${part}» se sale del documento (tiene ${total} página${total === 1 ? '' : 's'}).`);
      const step = a <= b ? 1 : -1;
      for (let p = a; step > 0 ? p <= b : p >= b; p += step) out.push(p - 1);
    } else if (/^\d+$/.test(part)) {
      const p = parseInt(part, 10);
      if (p < 1 || p > total) throw new RangeError(`La página ${p} no existe (el documento tiene ${total}).`);
      out.push(p - 1);
    } else {
      throw new RangeError(`No entiendo «${part}». Usa algo como 1-3, 5, 8-10.`);
    }
  }
  if (!out.length) return all;
  return out;
}

/**
 * Lista de hojas físicas: cada hoja tiene una página delante y otra (o ninguna) detrás.
 * pages: índices 0-based de una copia. Las copias van completas una tras otra.
 */
function planSheets(pages, copies) {
  const sheets = [];
  for (let c = 1; c <= copies; c++) {
    for (let i = 0; i < pages.length; i += 2) {
      sheets.push({ copy: c, front: pages[i], back: i + 1 < pages.length ? pages[i + 1] : null });
    }
  }
  return sheets;
}

/** Divide en lotes según la capacidad de la bandeja (hojas por pasada). */
function splitBatches(sheets, capacity) {
  const cap = Math.max(1, Math.floor(capacity) || sheets.length || 1);
  const batches = [];
  for (let i = 0; i < sheets.length; i += cap) batches.push(sheets.slice(i, i + cap));
  return batches;
}

/** Orden en que la impresora debe recibir los reversos de un lote. */
function backOrder(batch, invert) {
  const list = batch.map((s) => s.back);
  return invert ? list.reverse() : list;
}

function hasBacks(sheets) {
  return sheets.some((s) => s.back !== null);
}

// ---------- PDF ----------

async function loadSource(pdfPath) {
  const bytes = await fs.readFile(pdfPath);
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

/**
 * Copia páginas del original como XObject (se incrustan una sola vez aunque se repitan
 * en 100 copias) y respeta el giro propio de cada página.
 */
async function writeSequence(src, indices, outPath, { rotate180 = false } = {}) {
  const doc = await PDFDocument.create();
  doc.setProducer('Duplex Assistant · SafeTech');
  doc.setCreator('Duplex Assistant');
  const unique = [...new Set(indices.filter((i) => i !== null))];
  const srcPages = src.getPages();
  const embedded = new Map();
  if (unique.length) {
    const emb = await doc.embedPages(unique.map((i) => srcPages[i]));
    unique.forEach((i, k) => embedded.set(i, emb[k]));
  }
  // tamaño de referencia para hojas en blanco: la primera página real
  const ref = srcPages[unique[0] ?? 0];
  const refSize = ref ? ref.getSize() : { width: 612, height: 792 };
  const refRot = ref ? ref.getRotation().angle : 0;

  for (const idx of indices) {
    if (idx === null) {
      const page = doc.addPage([refSize.width, refSize.height]);
      // punto casi invisible: algunos drivers se saltan las páginas totalmente vacías
      page.drawRectangle({ x: refSize.width / 2 - 0.5, y: 18, width: 1, height: 1, color: rgb(0.95, 0.95, 0.95) });
      page.setRotation(degrees((refRot + (rotate180 ? 180 : 0)) % 360));
      continue;
    }
    const sp = srcPages[idx];
    const { width, height } = sp.getSize();
    const page = doc.addPage([width, height]);
    page.drawPage(embedded.get(idx), { x: 0, y: 0, width, height });
    page.setRotation(degrees((sp.getRotation().angle + (rotate180 ? 180 : 0)) % 360));
  }
  await fs.writeFile(outPath, await doc.save());
  return outPath;
}

/**
 * Genera los PDF de cada lote.
 * opts: { copies, range, capacity, invert, rotate, outDir }
 */
async function buildJob(pdfPath, opts) {
  const src = await loadSource(pdfPath);
  const total = src.getPageCount();
  const pages = parseRange(opts.range, total);
  const copies = Math.max(1, Math.floor(opts.copies) || 1);
  const sheets = planSheets(pages, copies);
  const batches = splitBatches(sheets, opts.capacity || sheets.length);
  await fs.mkdir(opts.outDir, { recursive: true });

  const out = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const fronts = path.join(opts.outDir, `lote${b + 1}-frentes.pdf`);
    await writeSequence(src, batch.map((s) => s.front), fronts);
    let backs = null;
    if (hasBacks(batch)) {
      backs = path.join(opts.outDir, `lote${b + 1}-reversos.pdf`);
      await writeSequence(src, backOrder(batch, !!opts.invert), backs, { rotate180: !!opts.rotate });
    }
    out.push({
      index: b + 1,
      sheets: batch.length,
      fronts,
      backs,
      firstCopy: batch[0].copy,
      lastCopy: batch[batch.length - 1].copy,
    });
  }
  return {
    totalPages: total,
    pagesPerCopy: pages.length,
    sheetsPerCopy: Math.ceil(pages.length / 2),
    totalSheets: sheets.length,
    copies,
    blanksPerCopy: pages.length % 2,
    batches: out,
  };
}

/**
 * Hoja de calibración: 2 hojas (4 caras) con flecha y número grande.
 * Los reversos se imprimen SIN invertir ni girar: lo que el usuario ve revela el ajuste.
 */
async function buildCalibration(outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const W = 612, H = 792;
  const red = rgb(0.86, 0.15, 0.15);
  const ink = rgb(0.07, 0.11, 0.18);
  const labels = [['HOJA 1', 'FRENTE'], ['HOJA 1', 'REVERSO'], ['HOJA 2', 'FRENTE'], ['HOJA 2', 'REVERSO']];
  for (const [hoja, cara] of labels) {
    const p = doc.addPage([W, H]);
    const isBack = cara === 'REVERSO';
    // flecha hacia el borde superior
    const cx = W / 2;
    p.drawRectangle({ x: cx - 34, y: 470, width: 68, height: 150, color: isBack ? ink : red });
    p.drawSvgPath(`M ${cx} 40 L ${cx - 110} 190 L ${cx + 110} 190 Z`, { x: 0, y: H, color: isBack ? ink : red });
    const centered = (text, font, size, y, color = ink) => {
      const w = font.widthOfTextAtSize(text, size);
      p.drawText(text, { x: (W - w) / 2, y, size, font, color });
    };
    centered('ARRIBA', bold, 26, 430);
    centered(hoja, bold, 96, 300);
    centered(cara, bold, 54, 235, isBack ? ink : red);
    centered('Página de calibración · Duplex Assistant', reg, 13, 120, rgb(0.4, 0.45, 0.55));
    centered('Desarrollado por SafeTech · safe-tech.cl', reg, 11, 100, rgb(0.5, 0.55, 0.62));
  }
  const tmp = path.join(outDir, 'calibracion-completa.pdf');
  await fs.writeFile(tmp, await doc.save());
  const src = await PDFDocument.load(await fs.readFile(tmp));
  const fronts = await writeSequence(src, [0, 2], path.join(outDir, 'calibracion-frentes.pdf'));
  const backs = await writeSequence(src, [1, 3], path.join(outDir, 'calibracion-reversos.pdf'));
  return { fronts, backs, sheets: 2 };
}

/**
 * Traduce la respuesta del usuario a la calibración.
 * answer: 'ok' | 'swapped' | 'upside' | 'both' | 'same-side'
 */
function calibrationFromAnswer(answer) {
  switch (answer) {
    case 'ok': return { invert: false, rotate: false };
    case 'swapped': return { invert: true, rotate: false };
    case 'upside': return { invert: false, rotate: true };
    case 'both': return { invert: true, rotate: true };
    default: return null;
  }
}

async function pageCount(pdfPath) {
  const src = await loadSource(pdfPath);
  return src.getPageCount();
}

module.exports = {
  parseRange, planSheets, splitBatches, backOrder, buildJob, buildCalibration, calibrationFromAnswer, pageCount,
};
