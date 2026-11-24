'use strict';
// Impresión en Linux con CUPS (lp / lpstat / lpoptions).
const { spawn } = require('node:child_process');

function run(cmd, args, { timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, LC_ALL: 'C' } });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    const t = setTimeout(() => { p.kill(); reject(new Error('CUPS no respondió a tiempo.')); }, timeout);
    p.on('error', (e) => {
      clearTimeout(t);
      reject(e.code === 'ENOENT' ? new Error('No se encontró CUPS (lp). Instala el paquete «cups» y configura tu impresora.') : e);
    });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

/** Opciones del driver: "PageSize/Media Size: *Letter A4 Legal" */
function parseLpoptions(text) {
  const opts = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^([^/:]+)\/([^:]+):\s*(.*)$/);
    if (!m) continue;
    const values = m[3].trim().split(/\s+/).filter(Boolean);
    let def = null;
    const choices = values.map((v) => {
      if (v.startsWith('*')) { def = v.slice(1); return v.slice(1); }
      return v;
    });
    opts.push({ key: m[1].trim(), label: m[2].trim(), choices, default: def });
  }
  return opts;
}

// Opciones que la app maneja por su cuenta y no conviene exponer
const HIDDEN = new Set(['Duplex', 'OutputOrder', 'Collate', 'BRDuplex', 'JCLDuplex']);

async function printerOptions(printer) {
  const r = await run('lpoptions', ['-p', printer, '-l']);
  if (r.code !== 0) return { kind: 'cups', options: [] };
  return { kind: 'cups', options: parseLpoptions(r.out).filter((o) => !HIDDEN.has(o.key) && o.choices.length > 1) };
}

async function print(pdf, printer, opts = {}) {
  const args = ['-d', printer, '-t', require('node:path').basename(pdf), '-o', 'fit-to-page', '-o', 'sides=one-sided'];
  for (const [k, v] of Object.entries(opts.cups || {})) if (v) args.push('-o', `${k}=${v}`);
  const r = await run('lp', [...args, pdf]);
  if (r.code !== 0) throw new Error(`CUPS rechazó el trabajo: ${(r.err || r.out).trim()}`);
  const m = r.out.match(/request id is (\S+)/);
  return { ref: m ? m[1] : null };
}

async function queue(printer) {
  const r = await run('lpstat', ['-o', printer]);
  return r.out.split('\n').filter((l) => l.trim()).map((l) => ({ name: l.split(/\s+/)[0], printed: 0, total: 0, status: '' }));
}

/** Cancela un trabajo de la cola (ref = id de CUPS, p. ej. «Brother_DCP-T710W-31»). */
async function cancel(_printer, ref) {
  if (!ref || !/^[\w.@-]+$/.test(ref)) return false;
  const r = await run('cancel', [ref]);
  return r.code === 0;
}

async function openDriverSettings() { return false; }
function resetDriverSettings() {}
function hasProfile() { return false; }

module.exports = { print, queue, cancel, printerOptions, openDriverSettings, resetDriverSettings, hasProfile, parseLpoptions };
