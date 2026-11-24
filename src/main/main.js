'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, nativeTheme } = require('electron');
const { pathToFileURL } = require('node:url');

const store = require('./store');
const compose = require('./compose');
const convert = require('./convert');
const scanner = require('./scanner');
const updater = require('./updater');
const printing = process.platform === 'win32' ? require('./printing/windows') : require('./printing/linux');

const RENDERER = path.join(__dirname, '..', '..', 'dist', 'renderer');
const SELFTEST = process.env.DA_SELFTEST || null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock() && !SELFTEST) app.quit();

let win;

function createWindow() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#09111F',
    title: 'Duplex Assistant',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0C1626', symbolColor: '#DBE5F1', height: 52 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required', // la guía por voz habla apenas se abre la app
    },
  });
  win.setMenuBarVisibility(false);
  win.loadURL(SELFTEST ? `app://ui/index.html?selftest=${encodeURIComponent(SELFTEST)}` : 'app://ui/index.html');
  win.once('ready-to-show', () => (SELFTEST ? win.showInactive() : win.show()));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

// ---------- IPC ----------
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[${channel}]`, err);
      return { __error: true, message: err.message || String(err), code: err.code || null };
    }
  });
}

// Solo se entregan PDFs que la app preparó o que el usuario eligió.
const allowedPdfs = new Set();

function registerIpc() {
  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    lastPrinter: store.get('lastPrinter', null),
    libreOffice: !!convert.findLibreOffice(),
    onlyOffice: !!convert.findOnlyOffice(),
  }));
  handle('app:open-external', (url) => {
    if (/^https:\/\/([a-z0-9-]+\.)*(safe-tech\.cl|github\.com)\//i.test(url)) shell.openExternal(url);
    // Reportar problemas o sugerencias: solo el correo de SafeTech
    else if (/^mailto:contacto@safe-tech\.cl(\?|$)/i.test(url)) shell.openExternal(url);
  });

  // Preferencias generales: voz, sonidos y primer inicio.
  handle('settings:get', () => ({ voice: true, sounds: true, onboarded: false, ...store.get('settings', {}) }));
  handle('settings:set', (patch) => {
    const s = { voice: true, sounds: true, onboarded: false, ...store.get('settings', {}), ...patch };
    store.set('settings', s);
    return s;
  });

  handle('update:state', () => updater.getState());
  handle('update:check', () => updater.check());
  handle('update:download', () => updater.download());
  handle('update:install', () => updater.install());

  handle('printers:list', async () => {
    const list = await win.webContents.getPrintersAsync();
    return list
      .filter((p) => !/^(Microsoft Print to PDF|Microsoft XPS|OneNote|Fax|PDF24|AnyDesk|Nitro|Send To OneNote)/i.test(p.name))
      .map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault, status: p.status }));
  });
  handle('printer:get', (name) => {
    const p = store.printer(name);
    return { ...p, effectiveInvert: store.effectiveInvert(p), keepsOrder: store.keepsOrder(p), driverProfile: printing.hasProfile(name) };
  });
  handle('printer:update', (name, patch) => store.updatePrinter(name, patch));
  handle('printer:set-last', (name) => store.set('lastPrinter', name));
  handle('printer:options', (name) => printing.printerOptions(name));
  handle('printer:driver-settings', (name) => printing.openDriverSettings(name));
  handle('printer:driver-reset', (name) => printing.resetDriverSettings(name));

  handle('scan:start', () => scanner.scan((files) => {
    if (win && !win.isDestroyed()) win.webContents.send('scan:batch', files);
  }));
  handle('scan:cancel', () => scanner.cancel());

  handle('file:pick', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Elige el documento que quieres imprimir',
      properties: ['openFile'],
      filters: [
        { name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp', 'txt', 'md', 'html', 'htm'] },
        { name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] },
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    const st = fs.statSync(p);
    return { path: p, name: path.basename(p), dir: path.dirname(p), kind: convert.kindOf(p), size: st.size, mtime: st.mtimeMs };
  });
  handle('file:prepare', async (file, opts = {}) => {
    const res = await convert.toPdf(file, { pageSize: opts.pageSize || 'letter' });
    allowedPdfs.add(res.pdfPath);
    const pages = await compose.pageCount(res.pdfPath);
    return { ...res, pages };
  });
  handle('file:read-pdf', async (pdfPath) => {
    if (!allowedPdfs.has(pdfPath)) throw new Error('Archivo no autorizado.');
    return new Uint8Array(await fs.promises.readFile(pdfPath));
  });
  handle('file:reveal', (file) => shell.showItemInFolder(file));

  handle('job:plan', async ({ pdfPath, copies, range, printer }) => {
    if (!allowedPdfs.has(pdfPath)) throw new Error('Archivo no autorizado.');
    const prof = store.printer(printer);
    const outDir = path.join(os.tmpdir(), 'duplex-assistant', 'trabajos', String(Date.now()));
    const plan = await compose.buildJob(pdfPath, {
      copies, range, capacity: prof.capacity, invert: store.effectiveInvert(prof), rotate: prof.rotate, outDir, outputFace: prof.outputFace, stackReversed: prof.stackReversed,
    });
    for (const b of plan.batches) { allowedPdfs.add(b.fronts); if (b.backs) allowedPdfs.add(b.backs); }
    return { ...plan, secPerSheet: prof.secPerSheet };
  });
  handle('job:print', async ({ file, printer }) => {
    if (!allowedPdfs.has(file)) throw new Error('Archivo no autorizado.');
    const prof = store.printer(printer);
    store.set('lastPrinter', printer);
    return printing.print(file, printer, { paper: prof.paper, color: prof.color, cups: prof.cups });
  });
  handle('job:queue', (printer) => printing.queue(printer));
  handle('job:cancel', (printer, ref) => (typeof ref === 'string' ? printing.cancel(printer, ref) : false));
  handle('job:calibration', async () => {
    const cal = await compose.buildCalibration(path.join(os.tmpdir(), 'duplex-assistant', 'calibracion'));
    allowedPdfs.add(cal.fronts); allowedPdfs.add(cal.backs);
    return cal;
  });
  handle('job:learn-speed', (printer, sheets, seconds) => {
    if (!(sheets > 0 && seconds > 0)) return null;
    const prof = store.printer(printer);
    const measured = Math.min(60, Math.max(2, seconds / sheets));
    const secPerSheet = Math.round((prof.secPerSheet * 0.4 + measured * 0.6) * 10) / 10;
    return store.updatePrinter(printer, { secPerSheet });
  });
}

// ---------- autoprueba: capturas de cada pantalla ----------
function registerSelftest() {
  ipcMain.handle('selftest:capture', async (_e, name) => {
    const dir = path.resolve(process.env.DA_SELFTEST_OUT || 'selftest-out');
    fs.mkdirSync(dir, { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
    return true;
  });
  ipcMain.handle('selftest:done', () => app.quit());
  ipcMain.handle('selftest:resize', (_e, w, h) => win.setContentSize(w, h));
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(RENDERER, decodeURIComponent(pathname)));
    if (!file.startsWith(RENDERER)) return new Response('no', { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });
  registerIpc();
  if (SELFTEST) registerSelftest();
  createWindow();
  if (!SELFTEST) updater.init((s) => { if (win && !win.isDestroyed()) win.webContents.send('update:state', s); });
});

app.on('window-all-closed', () => app.quit());
