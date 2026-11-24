'use strict';
// Actualizaciones desde GitHub Releases: avisa, descarga solo si el usuario lo pide y reinicia para instalar.
const { app } = require('electron');

let autoUpdater = null;
let send = () => {};
let state = { status: 'idle' }; // idle | checking | available | downloading | ready | none | error | unsupported
let timer = null;

function supported() {
  if (process.env.DA_UPDATE_FORCE === '1') return true;
  if (!app.isPackaged) return false;
  if (process.platform === 'win32') return true;
  return process.platform === 'linux' && !!process.env.APPIMAGE;
}

function setState(patch) {
  state = { ...state, ...patch };
  send(state);
  // Diagnóstico opcional (pruebas): registra cada estado y descarga sola si se pide.
  if (process.env.DA_UPDATE_LOG) {
    require('node:fs').appendFileSync(process.env.DA_UPDATE_LOG, `${new Date().toISOString()} ${JSON.stringify({ ...state, notes: undefined })}\n`);
  }
  if (process.env.DA_UPDATE_AUTODOWNLOAD === '1' && state.status === 'available') setImmediate(download);
}

function init(sender) {
  send = sender;
  if (!supported()) { state = { status: 'unsupported' }; return; }
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;
  autoUpdater.on('checking-for-update', () => setState({ status: 'checking' }));
  autoUpdater.on('update-available', (info) => setState({ status: 'available', version: info.version, notes: plainNotes(info.releaseNotes) }));
  autoUpdater.on('update-not-available', () => setState({ status: 'none' }));
  autoUpdater.on('download-progress', (p) => setState({ status: 'downloading', percent: p.percent, transferred: p.transferred, total: p.total, speed: p.bytesPerSecond }));
  autoUpdater.on('update-downloaded', (info) => setState({ status: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => {
    // Sin internet o GitHub caído: no molestar; si falló una descarga pedida, avisar.
    const wasDownloading = state.status === 'downloading';
    setState({ status: wasDownloading ? 'error' : 'none', error: wasDownloading ? 'No se pudo descargar la actualización. Revisa tu conexión e inténtalo de nuevo.' : null });
    console.error('[updater]', err?.message || err);
  });
  setTimeout(check, 6000);
  timer = setInterval(check, 6 * 60 * 60 * 1000);
}

function plainNotes(notes) {
  if (!notes) return '';
  const text = Array.isArray(notes) ? notes.map((n) => n.note).join('\n') : String(notes);
  return text.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 600);
}

async function check() {
  if (!autoUpdater || ['downloading', 'ready'].includes(state.status)) return state;
  try { await autoUpdater.checkForUpdates(); } catch { /* se informa por el evento error */ }
  return state;
}

async function download() {
  if (!autoUpdater || state.status !== 'available' && state.status !== 'error') return state;
  setState({ status: 'downloading', percent: 0, error: null });
  try { await autoUpdater.downloadUpdate(); } catch { /* evento error */ }
  return state;
}

function install() {
  if (!autoUpdater || state.status !== 'ready') return false;
  clearInterval(timer);
  // Windows: instalador silencioso y vuelve a abrir la app. Linux: reemplaza el AppImage y reinicia.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return true;
}

module.exports = { init, check, download, install, getState: () => state };
