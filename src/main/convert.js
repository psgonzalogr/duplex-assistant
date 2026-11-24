'use strict';
// Convierte cualquier documento en un PDF listo para imprimir.
const fs = require('node:fs/promises');
const fss = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { BrowserWindow } = require('electron');
const craft = require('./craft');

const KINDS = {
  pdf: ['pdf'],
  word: ['doc', 'docx', 'docm', 'dot', 'dotx', 'odt', 'ott', 'rtf', 'wpd', 'pages'],
  excel: ['xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'ots', 'csv'],
  powerpoint: ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'odp', 'otp', 'key'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'avif', 'ico', 'jfif'],
  web: ['html', 'htm', 'xhtml', 'mht', 'mhtml'],
  text: ['txt', 'md', 'markdown', 'log', 'json', 'xml', 'yml', 'yaml', 'ini', 'cfg', 'conf', 'tex', 'srt', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'sh', 'ps1', 'bat', 'sql', 'css'],
};
// CSV se abre mejor con la hoja de cálculo si existe; si no, como texto.
const EXT_KIND = {};
for (const [k, list] of Object.entries(KINDS)) for (const e of list) EXT_KIND[e] = k;

function kindOf(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return EXT_KIND[ext] || 'other';
}

const PAGE_SIZES = { letter: 'Letter', legal: 'Legal', a4: 'A4', a5: 'A5', a3: 'A3' };

let cacheDir;
function getCacheDir() {
  if (!cacheDir) cacheDir = path.join(os.tmpdir(), 'duplex-assistant', 'convertidos');
  return cacheDir;
}

async function cacheKey(file, extra) {
  const st = await fs.stat(file);
  return crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}|${extra}`).digest('hex').slice(0, 16);
}

function run(cmd, args, { env, timeout = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    const t = setTimeout(() => { p.kill(); reject(new Error('La conversión tardó demasiado y se canceló.')); }, timeout);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(err || out || `código ${code}`)); });
  });
}

// ---------- HTML → PDF con Chromium (imágenes, texto, páginas web) ----------

function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

async function htmlFileToPdf(htmlPath, outPdf, pageSize) {
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, offscreen: false } });
  try {
    await win.loadURL(pathToFileURL(htmlPath).href);
    const data = await win.webContents.printToPDF({
      pageSize: PAGE_SIZES[pageSize] || 'Letter',
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      preferCSSPageSize: false,
    });
    await fs.writeFile(outPdf, data);
  } finally {
    win.destroy();
  }
}

async function imageToPdf(file, outPdf, pageSize) {
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;height:100%}
    body{display:flex;align-items:center;justify-content:center}
    img{max-width:100%;max-height:100vh;object-fit:contain}
  </style><img src="${pathToFileURL(file).href}">`;
  const tmp = outPdf.replace(/\.pdf$/, '.html');
  await fs.writeFile(tmp, html);
  await htmlFileToPdf(tmp, outPdf, pageSize);
}

async function textToPdf(file, outPdf, pageSize) {
  const buf = await fs.readFile(file);
  let text = buf.toString('utf8');
  if (text.includes('\uFFFD')) text = buf.toString('latin1');
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(path.basename(file))}</title><style>
    body{font:11pt/1.45 "Segoe UI","Inter","DejaVu Sans",sans-serif;color:#111;margin:0}
    pre{white-space:pre-wrap;word-wrap:break-word;font:10pt/1.45 Consolas,"DejaVu Sans Mono",monospace;margin:0}
  </style><pre>${esc(text)}</pre>`;
  const tmp = outPdf.replace(/\.pdf$/, '.html');
  await fs.writeFile(tmp, html, 'utf8');
  await htmlFileToPdf(tmp, outPdf, pageSize);
}

async function looksLikeText(file) {
  const fh = await fs.open(file, 'r');
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(8192), 0, 8192, 0);
    if (!bytesRead) return false;
    return !buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await fh.close();
  }
}

// ---------- Documentos de oficina ----------

function findLibreOffice() {
  const cands = process.platform === 'win32'
    ? [
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'LibreOffice', 'program', 'soffice.exe'),
      ]
    : ['/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/local/bin/soffice', '/opt/libreoffice/program/soffice', '/snap/bin/libreoffice'];
  for (const c of cands) if (fss.existsSync(c)) return { cmd: c, args: [] };
  if (process.platform === 'linux') {
    for (const fp of ['/var/lib/flatpak/exports/bin/org.libreoffice.LibreOffice', path.join(os.homedir(), '.local/share/flatpak/exports/bin/org.libreoffice.LibreOffice')]) {
      if (fss.existsSync(fp)) return { cmd: 'flatpak', args: ['run', '--filesystem=host', 'org.libreoffice.LibreOffice'] };
    }
    // AppImage oficial de LibreOffice en ~/Applications
    for (const dir of [path.join(os.homedir(), 'Applications'), path.join(os.homedir(), 'Aplicaciones')]) {
      let list = [];
      try { list = fss.readdirSync(dir); } catch { continue; }
      const f = list.filter((n) => /^libreoffice.*\.appimage$/i.test(n)).sort().pop();
      if (f) return { cmd: path.join(dir, f), args: [] };
    }
  }
  return null;
}

async function libreOfficeToPdf(lo, file, outPdf) {
  const outDir = path.dirname(outPdf);
  const profile = pathToFileURL(path.join(os.tmpdir(), 'duplex-assistant', 'lo-perfil')).href;
  await run(lo.cmd, [...lo.args, `-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', outDir, file]);
  const produced = path.join(outDir, path.basename(file, path.extname(file)) + '.pdf');
  await fs.rename(produced, outPdf);
}

// ---------- ONLYOFFICE (conversor x2t, sin abrir ventanas) ----------

/**
 * Busca el conversor de ONLYOFFICE Desktop Editors y su índice de fuentes (AllFonts.js), que la app de
 * escritorio genera la primera vez que se abre. Devuelve { x2t, fontsDir } o null.
 */
function findOnlyOffice() {
  const home = os.homedir();
  const cands = process.platform === 'win32'
    ? [
        { x2t: path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ONLYOFFICE', 'DesktopEditors', 'converter', 'x2t.exe'),
          fonts: path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'ONLYOFFICE', 'DesktopEditors', 'data', 'fonts') },
        { x2t: path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'ONLYOFFICE', 'DesktopEditors', 'converter', 'x2t.exe'),
          fonts: path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'ONLYOFFICE', 'DesktopEditors', 'data', 'fonts') },
      ]
    : [
        { x2t: '/opt/onlyoffice/desktopeditors/converter/x2t', fonts: path.join(home, '.local/share/onlyoffice/desktopeditors/data/fonts') },
        { x2t: '/usr/lib/onlyoffice/desktopeditors/converter/x2t', fonts: path.join(home, '.local/share/onlyoffice/desktopeditors/data/fonts') },
        { x2t: '/snap/onlyoffice-desktopeditors/current/opt/onlyoffice/desktopeditors/converter/x2t',
          fonts: path.join(home, 'snap/onlyoffice-desktopeditors/current/.local/share/onlyoffice/desktopeditors/data/fonts') },
      ];
  for (const c of cands) {
    if (!fss.existsSync(c.x2t)) continue;
    const hasFonts = fss.existsSync(path.join(c.fonts, 'AllFonts.js'));
    return { x2t: c.x2t, fontsDir: hasFonts ? c.fonts : null };
  }
  return null;
}

const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

async function onlyOfficeToPdf(oo, file, outPdf) {
  if (!oo.fontsDir) {
    const e = new Error('ONLYOFFICE está instalado pero todavía no ha preparado sus fuentes. Ábrelo una vez y vuelve a intentarlo.');
    e.code = 'OO_NO_FONTS';
    throw e;
  }
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'da-oo-'));
  try {
    const params = path.join(work, 'params.xml');
    // 513 = PDF. Las rutas van escapadas: el archivo puede tener &, < o comillas en el nombre.
    await fs.writeFile(params, `<?xml version="1.0" encoding="utf-8"?>
<TaskQueueDataConvert xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <m_sFileFrom>${xml(file)}</m_sFileFrom>
  <m_sFileTo>${xml(outPdf)}</m_sFileTo>
  <m_nFormatTo>513</m_nFormatTo>
  <m_sAllFontsPath>${xml(path.join(oo.fontsDir, 'AllFonts.js'))}</m_sAllFontsPath>
  <m_sFontDir>${xml(oo.fontsDir)}</m_sFontDir>
  <m_bIsNoBase64>true</m_bIsNoBase64>
  <m_sTempDir>${xml(path.join(work, 'tmp'))}</m_sTempDir>
</TaskQueueDataConvert>
`, 'utf8');
    await fs.mkdir(path.join(work, 'tmp'), { recursive: true });
    await run(oo.x2t, [params]);
    const st = await fs.stat(outPdf).catch(() => null);
    if (!st || st.size < 100) throw new Error('ONLYOFFICE no generó el PDF.');
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

const MSO_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$in = $env:DA_IN; $out = $env:DA_OUT
switch ($env:DA_KIND) {
  'word' {
    $app = New-Object -ComObject Word.Application; $app.Visible = $false; $app.DisplayAlerts = 0
    try { $d = $app.Documents.Open($in, $false, $true, $false); $d.ExportAsFixedFormat($out, 17); $d.Close(0) } finally { $app.Quit() }
  }
  'excel' {
    $app = New-Object -ComObject Excel.Application; $app.Visible = $false; $app.DisplayAlerts = $false
    try { $b = $app.Workbooks.Open($in, 0, $true); $b.ExportAsFixedFormat(0, $out); $b.Close($false) } finally { $app.Quit() }
  }
  'powerpoint' {
    $app = New-Object -ComObject PowerPoint.Application
    try { $p = $app.Presentations.Open($in, -1, 0, 0); $p.SaveAs($out, 32); $p.Close() } finally { $app.Quit() }
  }
}`;

async function msOfficeToPdf(kind, file, outPdf) {
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', MSO_SCRIPT], {
    env: { DA_IN: file, DA_OUT: outPdf, DA_KIND: kind },
  });
  if (!fss.existsSync(outPdf)) throw new Error('Office no generó el PDF.');
}

// Formatos propios de LibreOffice (OpenDocument): ahí LibreOffice va primero.
const ODF = new Set(['.odt', '.ott', '.ods', '.ots', '.odp', '.otp']);

/**
 * Convierte con el primer programa de oficina que funcione. Orden:
 * Windows: Microsoft Office → ONLYOFFICE → LibreOffice. Linux: ONLYOFFICE → LibreOffice.
 * ONLYOFFICE respeta mejor el diseño de Word/Excel/PowerPoint; con OpenDocument, LibreOffice va antes.
 */
async function officeToPdf(kind, file, outPdf) {
  const errors = [];
  if (process.platform === 'win32') {
    try { await msOfficeToPdf(kind, file, outPdf); return 'Microsoft Office'; } catch (e) { errors.push(e); await fs.rm(outPdf, { force: true }).catch(() => {}); }
  }
  const lo = findLibreOffice();
  const oo = findOnlyOffice();
  const tries = [];
  if (oo) tries.push(['ONLYOFFICE', () => onlyOfficeToPdf(oo, file, outPdf)]);
  if (lo) tries.push(['LibreOffice', () => libreOfficeToPdf(lo, file, outPdf)]);
  if (ODF.has(path.extname(file).toLowerCase())) tries.reverse();
  // ArtCraft al final: abre su ventana unos segundos mientras convierte
  for (const c of craft.craftsFor(kind)) tries.push([c.name, () => craft.craftToPdf(c.app, c.bin, file, outPdf)]);
  for (const [name, fn] of tries) {
    try { await fn(); return name; } catch (e) { errors.push(e); await fs.rm(outPdf, { force: true }).catch(() => {}); }
  }
  const noFonts = errors.find((e) => e.code === 'OO_NO_FONTS');
  const err = new Error(
    tries.length === 1 && noFonts
      ? noFonts.message
      : tries.length || process.platform === 'win32'
        ? 'No se pudo convertir el documento con los programas de oficina instalados. Puedes abrirlo en uno de ellos y exportarlo a PDF desde aquí abajo, o revisar que no esté protegido con contraseña.'
        : 'No encontré un programa que convierta este documento solo. Puedes abrirlo en tu programa de oficina y exportarlo a PDF desde aquí abajo, o instalar ONLYOFFICE o LibreOffice para que se convierta automáticamente.'
  );
  err.code = 'NO_OFFICE';
  err.details = errors.map((e) => e.message).join('\n');
  throw err;
}

/**
 * Devuelve { pdfPath, kind, via } con un PDF imprimible.
 */
async function toPdf(file, { pageSize = 'letter' } = {}) {
  if (!fss.existsSync(file)) throw new Error('El archivo ya no existe en esa carpeta.');
  let kind = kindOf(file);
  if (kind === 'pdf') return { pdfPath: file, kind, via: 'original' };
  if (kind === 'other') {
    if (await looksLikeText(file)) kind = 'text';
    else {
      const e = new Error('Este tipo de archivo no se puede imprimir directamente. Ábrelo en su programa y guárdalo como PDF.');
      e.code = 'UNSUPPORTED';
      throw e;
    }
  }
  const dir = getCacheDir();
  await fs.mkdir(dir, { recursive: true });
  const key = await cacheKey(file, pageSize);
  const out = path.join(dir, `${key}.pdf`);
  if (await isUsablePdf(out)) return { pdfPath: out, kind, via: 'caché' };
  await fs.rm(out, { force: true }); // restos de una conversión fallida de versiones anteriores

  // Se convierte a un archivo aparte y solo pasa a la caché si terminó bien: una conversión fallida
  // no puede dejar un PDF roto que después se use como si estuviera listo.
  const tmp = path.join(dir, `${key}.${process.pid}-${Date.now()}.tmp.pdf`);
  let via = 'Duplex Assistant';
  try {
    if (kind === 'image') await imageToPdf(file, tmp, pageSize);
    else if (kind === 'text') await textToPdf(file, tmp, pageSize);
    else if (kind === 'web') await htmlFileToPdf(file, tmp, pageSize);
    else if (kind === 'excel' && path.extname(file).toLowerCase() === '.csv') {
      try { via = await officeToPdf(kind, file, tmp); } catch { await fs.rm(tmp, { force: true }); await textToPdf(file, tmp, pageSize); }
    } else via = await officeToPdf(kind, file, tmp);
    if (!(await isUsablePdf(tmp))) throw new Error('La conversión no produjo un PDF válido.');
    await fs.rename(tmp, out);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
    await fs.rm(tmp.replace(/\.pdf$/, '.html'), { force: true }).catch(() => {});
  }
  return { pdfPath: out, kind, via };
}

/** Un PDF completo: existe, tiene tamaño razonable y termina con la marca de fin de archivo. */
async function isUsablePdf(p) {
  let fh;
  try {
    const st = await fs.stat(p);
    if (st.size < 100) return false;
    fh = await fs.open(p, 'r');
    const n = Math.min(2048, st.size);
    const { buffer } = await fh.read(Buffer.alloc(n), 0, n, st.size - n);
    return buffer.toString('latin1').includes('%%EOF');
  } catch {
    return false;
  } finally {
    await fh?.close();
  }
}

module.exports = { toPdf, kindOf, KINDS, findLibreOffice, findOnlyOffice, officeToPdf };
