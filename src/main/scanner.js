'use strict';
// Busca documentos imprimibles en las carpetas habituales del usuario.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { app } = require('electron');
const { kindOf } = require('./convert');

const SKIP = new Set([
  'node_modules', 'appdata', '$recycle.bin', 'system volume information', 'windows', 'program files',
  'program files (x86)', 'programdata', 'library', 'snap', 'venv', '.venv', '__pycache__', 'site-packages',
  'dist', 'build', 'target', 'cache', 'caches', 'temp', 'tmp', 'steamapps', 'wineprefix',
  'powershell', 'windowspowershell', 'modules', 'my games', 'visual studio code', '.git',
]);
const SCAN_KINDS = new Set(['pdf', 'word', 'excel', 'powerpoint', 'image', 'text']);
// En texto solo lo que una persona imprimiría, no código fuente.
const TEXT_EXT = new Set(['.txt', '.md', '.csv', '.rtf']);

function roots() {
  const home = os.homedir();
  const list = [];
  const add = (p) => { if (p && !list.includes(p)) list.push(p); };
  for (const k of ['desktop', 'documents', 'downloads', 'pictures']) {
    try { add(app.getPath(k)); } catch { /* carpeta no definida */ }
  }
  if (process.env.OneDrive) add(process.env.OneDrive);
  if (process.env.OneDriveCommercial) add(process.env.OneDriveCommercial);
  // Nombres en español por si XDG no está configurado
  for (const n of ['Escritorio', 'Documentos', 'Descargas', 'Imágenes']) add(path.join(home, n));
  return list;
}

let current = null;

/**
 * Recorre las carpetas y llama a onBatch(files[]) en tandas. Se puede cancelar con cancel().
 */
async function scan(onBatch, { maxDepth = 7, maxFiles = 6000 } = {}) {
  cancel();
  const token = { cancelled: false };
  current = token;
  const seen = new Set();
  let found = 0;
  let batch = [];
  const flush = () => { if (batch.length) { onBatch(batch); batch = []; } };

  async function walk(dir, depth) {
    if (token.cancelled || found >= maxFiles || depth > maxDepth) return;
    let real;
    try { real = await fs.realpath(dir); } catch { return; }
    if (seen.has(real)) return;
    seen.add(real);
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    const subdirs = [];
    for (const e of entries) {
      if (token.cancelled) return;
      const name = e.name;
      if (name.startsWith('.') || name.startsWith('~$')) continue;
      const full = path.join(dir, name);
      if (e.isDirectory()) {
        if (!SKIP.has(name.toLowerCase())) subdirs.push(full);
        continue;
      }
      if (!e.isFile() && !e.isSymbolicLink()) continue;
      const kind = kindOf(name);
      if (!SCAN_KINDS.has(kind)) continue;
      if (kind === 'text' && !TEXT_EXT.has(path.extname(name).toLowerCase())) continue;
      let st;
      try { st = await fs.stat(full); } catch { continue; }
      if (kind === 'image' && st.size < 30 * 1024) continue; // íconos y miniaturas
      batch.push({ path: full, name, dir, kind, size: st.size, mtime: st.mtimeMs });
      found++;
      if (batch.length >= 60) flush();
      if (found >= maxFiles) break;
    }
    for (const d of subdirs) await walk(d, depth + 1);
  }

  for (const r of roots()) await walk(r, 0);
  flush();
  if (current === token) current = null;
  return { total: found, cancelled: token.cancelled };
}

function cancel() {
  if (current) current.cancelled = true;
  current = null;
}

module.exports = { scan, cancel, roots };
