'use strict';
// Exportación asistida: para programas que no se pueden automatizar (WPS, SoftMaker, Calligra…) o cuando
// la conversión automática falla. Se abre el documento en el programa elegido, la persona lo exporta a PDF
// y la app detecta el PDF nuevo en la misma carpeta.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { shell } = require('electron');
const { findCraft } = require('./craft');

const home = os.homedir();
const PATH_DIRS = [...new Set([...(process.env.PATH || '').split(path.delimiter), '/usr/bin', '/usr/local/bin', path.join(home, '.local/bin')])].filter(Boolean);

function which(name) {
  for (const d of PATH_DIRS) {
    const p = path.join(d, name);
    try { if (fs.statSync(p).isFile()) return p; } catch { /* no está */ }
  }
  return null;
}

/** Primer ejecutable del PATH cuyo nombre calza (p. ej. textmaker24, textmaker21free). */
function whichLike(re) {
  for (const d of PATH_DIRS) {
    let list = [];
    try { list = fs.readdirSync(d); } catch { continue; }
    const f = list.filter((n) => re.test(n)).sort().pop();
    if (f) return path.join(d, f);
  }
  return null;
}

const firstExisting = (...c) => c.find((p) => p && fs.existsSync(p)) || null;
const flatpak = (id) => firstExisting(`/var/lib/flatpak/exports/bin/${id}`, path.join(home, `.local/share/flatpak/exports/bin/${id}`)) ? id : null;

const HINT = {
  wps: 'En WPS: Menú › Exportar a PDF.',
  onlyoffice: 'En ONLYOFFICE: Archivo › Guardar como › PDF.',
  libreoffice: 'En LibreOffice: Archivo › Exportar a PDF.',
  softmaker: 'En SoftMaker: Archivo › Exportar como PDF.',
  calligra: 'En Calligra: Archivo › Exportar a PDF.',
  default: 'En tu programa, busca «Exportar a PDF» o «Guardar como» › PDF.',
};

/** Programas instalados que pueden abrir este tipo de documento: [{ id, name, hint, cmd, args }]. */
function appsFor(kind) {
  const out = [];
  const add = (id, name, hint, cmd, args = []) => { if (cmd) out.push({ id, name, hint, cmd, args }); };
  if (process.platform !== 'win32') {
    const wps = { word: ['wps', 'WPS Writer'], excel: ['et', 'WPS Spreadsheets'], powerpoint: ['wpp', 'WPS Presentation'] }[kind];
    if (wps) {
      const bin = which(wps[0]) || firstExisting(`/opt/kingsoft/wps-office/office6/${wps[0]}`);
      if (bin) add(`wps-${wps[0]}`, wps[1], HINT.wps, bin);
      else if (flatpak('com.wps.Office')) add('wps-flatpak', 'WPS Office', HINT.wps, 'flatpak', ['run', 'com.wps.Office']);
    }
    add('onlyoffice', 'ONLYOFFICE', HINT.onlyoffice, which('onlyoffice-desktopeditors') || which('desktopeditors'));
    if (!out.some((a) => a.id === 'onlyoffice') && flatpak('org.onlyoffice.desktopeditors')) {
      add('onlyoffice-flatpak', 'ONLYOFFICE', HINT.onlyoffice, 'flatpak', ['run', 'org.onlyoffice.desktopeditors']);
    }
    const lo = which('libreoffice') || which('soffice');
    if (lo) add('libreoffice', 'LibreOffice', HINT.libreoffice, lo);
    else if (flatpak('org.libreoffice.LibreOffice')) add('libreoffice-flatpak', 'LibreOffice', HINT.libreoffice, 'flatpak', ['run', 'org.libreoffice.LibreOffice']);
    const craftApp = { word: 'wordcraft', excel: 'gridcraft', powerpoint: 'deckcraft' }[kind];
    const craftName = { wordcraft: 'WordCraft', gridcraft: 'GridCraft', deckcraft: 'DeckCraft' }[craftApp];
    if (craftApp) add(craftApp, craftName, `En ${craftName}: Archivo › Exportar › PDF.`, findCraft(craftApp));
    const sm = { word: /^textmaker\d*(free)?$/, excel: /^planmaker\d*(free)?$/, powerpoint: /^presentations\d*(free)?$/ }[kind];
    if (sm) add('softmaker', { word: 'SoftMaker TextMaker', excel: 'SoftMaker PlanMaker', powerpoint: 'SoftMaker Presentations' }[kind], HINT.softmaker, whichLike(sm));
    const cal = { word: 'calligrawords', excel: 'calligrasheets', powerpoint: 'calligrastage' }[kind];
    if (cal) add('calligra', `Calligra ${cal.slice(8, 9).toUpperCase()}${cal.slice(9)}`, HINT.calligra, which(cal));
  }
  // Siempre: el programa que el sistema usa para ese archivo
  out.push({ id: 'default', name: 'Programa predeterminado', hint: HINT.default, cmd: null, args: [] });
  return out;
}

/** Abre el archivo en el programa elegido (no espera a que se cierre). */
async function openIn(app, file) {
  if (app.id === 'default') {
    const err = await shell.openPath(file);
    if (err) throw new Error(err);
    return true;
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(app.cmd, [...app.args, file], { detached: true, stdio: 'ignore', env });
  child.on('error', () => { /* si no abre, la persona puede elegir otro */ });
  child.unref();
  return true;
}

/**
 * Busca el PDF que exportó la persona: en la carpeta del documento, con el mismo nombre (o que empiece
 * igual, porque algunos programas agregan sufijos) y creado después de abrirlo.
 */
function findExported(file, since) {
  const dir = path.dirname(file);
  const base = path.basename(file, path.extname(file)).toLowerCase();
  let best = null;
  let list = [];
  try { list = fs.readdirSync(dir); } catch { return null; }
  for (const n of list) {
    if (!/\.pdf$/i.test(n) || !n.toLowerCase().startsWith(base)) continue;
    const p = path.join(dir, n);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.mtimeMs < since - 2000 || st.size < 100) continue;
    if (!best || st.mtimeMs > best.mtime) best = { path: p, mtime: st.mtimeMs, size: st.size };
  }
  return best;
}

module.exports = { appsFor, openIn, findExported };
