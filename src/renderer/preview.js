// Renderiza páginas PDF con pdf.js (vista previa, miniaturas y simulación de hojas).
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const docs = new Map();

export async function openPdf(pdfPath) {
  if (docs.has(pdfPath)) return docs.get(pdfPath);
  const p = (async () => {
    const data = await window.da.readPdf(pdfPath);
    return pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  })();
  docs.set(pdfPath, p);
  try { return await p; } catch (e) { docs.delete(pdfPath); throw e; }
}

/** Dibuja la página (1-based) en un canvas que quepa en maxW × maxH (px CSS). */
export async function renderPage(doc, num, maxW, maxH, { rotate = 0 } = {}) {
  const page = await doc.getPage(num);
  const base = page.getViewport({ scale: 1, rotation: (page.rotate + rotate) % 360 });
  const scale = Math.min(maxW / base.width, maxH / base.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vp = page.getViewport({ scale: scale * dpr, rotation: (page.rotate + rotate) % 360 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
  canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, canvas }).promise;
  return canvas;
}

export function forget(pdfPath) {
  const p = docs.get(pdfPath);
  docs.delete(pdfPath);
  p?.then((d) => d.destroy()).catch(() => {});
}
