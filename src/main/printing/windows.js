'use strict';
// Impresión en Windows: SumatraPDF incluido + perfil propio de preferencias del driver.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { app } = require('electron');

function run(cmd, args, { timeout = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    const t = setTimeout(() => { p.kill(); reject(new Error('La impresora no respondió a tiempo.')); }, timeout);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

function sumatraPath() {
  const cands = [
    path.join(process.resourcesPath || '', 'vendor', 'SumatraPDF.exe'),
    path.join(app.getAppPath(), 'vendor', 'win', 'SumatraPDF.exe'),
    path.join(__dirname, '..', '..', '..', 'vendor', 'win', 'SumatraPDF.exe'),
  ];
  const found = cands.find((c) => fs.existsSync(c));
  if (!found) throw new Error('Falta el componente de impresión (SumatraPDF). Reinstala Duplex Assistant.');
  return found;
}

// ---------- perfil de preferencias del driver ----------
function profileDir() {
  const d = path.join(app.getPath('userData'), 'perfiles');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function profilePath(printer) {
  return path.join(profileDir(), `${printer.replace(/[^\w-]+/g, '_')}.dat`);
}
async function printui(args) {
  const r = await run('rundll32.exe', ['printui.dll,PrintUIEntry', ...args], { timeout: 30 * 60 * 1000 });
  if (r.code !== 0) throw new Error('Windows no permitió leer o aplicar las preferencias de la impresora.');
}
const store = (printer, file) => printui(['/Ss', '/n', printer, '/a', file, 'u']);
const restore = (printer, file) => printui(['/Sr', '/n', printer, '/a', file, 'u']);

function hasProfile(printer) {
  return fs.existsSync(profilePath(printer));
}

/** Aplica el perfil de la app mientras corre fn y luego deja todo como estaba. */
async function withProfile(printer, fn) {
  if (!hasProfile(printer)) return fn();
  const orig = path.join(os.tmpdir(), `da-orig-${Date.now()}.dat`);
  await store(printer, orig);
  try {
    await restore(printer, profilePath(printer));
    return await fn();
  } finally {
    await restore(printer, orig).catch(() => {});
    fs.rm(orig, { force: true }, () => {});
  }
}

/** Abre la ventana de preferencias del driver y guarda lo elegido solo para esta app. */
async function openDriverSettings(printer) {
  const orig = path.join(os.tmpdir(), `da-orig-${Date.now()}.dat`);
  await store(printer, orig);
  try {
    if (hasProfile(printer)) await restore(printer, profilePath(printer));
    await printui(['/e', '/n', printer]);
    await store(printer, profilePath(printer));
  } finally {
    await restore(printer, orig).catch(() => {});
    fs.rm(orig, { force: true }, () => {});
  }
  return true;
}

function resetDriverSettings(printer) {
  fs.rmSync(profilePath(printer), { force: true });
}

// ---------- imprimir ----------
async function print(pdf, printer, opts = {}) {
  const settings = ['fit'];
  if (opts.paper && opts.paper !== 'auto') settings.push(`paper=${opts.paper}`);
  if (opts.color === 'color') settings.push('color');
  if (opts.color === 'monochrome') settings.push('monochrome');
  const exe = sumatraPath();
  const r = await withProfile(printer, () =>
    run(exe, ['-print-to', printer, '-print-settings', settings.join(','), '-silent', '-exit-on-print', pdf])
  );
  if (r.code !== 0) throw new Error(`No se pudo enviar a la impresora (código ${r.code}). ${r.err}`.trim());
  return { ref: path.basename(pdf) };
}

/** Trabajos pendientes en la cola de la impresora (para el avance). */
async function queue(printer) {
  const name = printer.replace(/'/g, "''");
  const cmd = `$j = @(Get-PrintJob -PrinterName '${name}' -ErrorAction SilentlyContinue | Select-Object DocumentName,PagesPrinted,TotalPages,JobStatus); ConvertTo-Json -Compress -InputObject $j`;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 20000 });
  try {
    const list = JSON.parse(r.out.trim() || '[]');
    return (Array.isArray(list) ? list : [list]).filter(Boolean).map((j) => ({
      name: j.DocumentName || '',
      printed: j.PagesPrinted || 0,
      total: j.TotalPages || 0,
      status: String(j.JobStatus || ''),
    }));
  } catch {
    return [];
  }
}

/** Cancela los trabajos de este documento en la cola de Windows (ref = nombre del PDF). */
async function cancel(printer, ref) {
  if (!ref) return false;
  const q = (s) => String(s).replace(/'/g, "''");
  // -like trata [ ] como comodines: se escapan. Responde cuántos trabajos quitó de verdad
  // (con 0 la app no debe decir que detuvo la impresión).
  const pattern = `*${q(ref).replace(/([[\]*?`])/g, '`$1')}*`;
  const cmd = `$j = @(Get-PrintJob -PrinterName '${q(printer)}' -ErrorAction SilentlyContinue | Where-Object { $_.DocumentName -like '${pattern}' }); `
    + '$n = 0; foreach ($x in $j) { try { $x | Remove-PrintJob -ErrorAction Stop; $n++ } catch {} }; $n';
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 20000 });
  return r.code === 0 && parseInt(r.out.trim(), 10) > 0;
}

async function printerOptions() {
  return { kind: 'windows', hasProfile: false, options: [] };
}

module.exports = { print, queue, cancel, openDriverSettings, resetDriverSettings, hasProfile, printerOptions };
