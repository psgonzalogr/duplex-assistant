import { h, icon, clear, toast } from './ui.js';
import { mountHome } from './views/home.js';
import { mountPrinter } from './views/printer.js';
import { runPrint } from './views/run.js';
import { runCalibration } from './views/calibrate.js';
import logoSafeTech from '../../assets/logo-safetech-dark.png';

export const MARK = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E23434"/><stop offset="1" stop-color="#991B1B"/></linearGradient></defs>
  <rect width="64" height="64" rx="16" fill="url(#g)"/>
  <path d="M20 14h17l9 9v27H20z" fill="#F4F1EA"/>
  <path d="M37 14v9h9" fill="#D9D3C7"/>
  <rect x="25" y="29" width="15" height="3" rx="1.5" fill="#1B2333"/>
  <rect x="25" y="35" width="11" height="3" rx="1.5" fill="#9AA3B2"/>
  <path d="M14 36c0 9 6 16 15 17" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  <path d="m25 48 5 5-6 4" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const EXT = {
  pdf: 'pdf', doc: 'word', docx: 'word', odt: 'word', rtf: 'word', xls: 'excel', xlsx: 'excel', ods: 'excel', csv: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', odp: 'powerpoint', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  bmp: 'image', webp: 'image', svg: 'image', txt: 'text', md: 'text', html: 'web', htm: 'web',
};

const S = {
  info: { platform: 'win32', version: '' },
  view: 'home',
  files: [],
  scanning: false,
  query: '',
  kindFilter: 'all',
  selected: null,
  prepared: null,
  preparing: false,
  prepError: null,
  previewMode: 'pages',
  pageIdx: 0,
  copies: 1,
  range: '',
  printers: [],
  printer: null,
  profile: null,
  returnTo: 'home',
};

const app = {
  S,
  api: window.da,
  kindOf: (name) => EXT[name.split('.').pop().toLowerCase()] || 'other',
  current: null,
  go,
  setPrinter,
  rescan,
};

// ---------- armazón ----------
const navBtns = {};
const pillName = h('span.name');
const pillDot = h('span.dot');
const main = h('main');

function shell() {
  const nav = h('nav.nav', { 'aria-label': 'Secciones' },
    (navBtns.home = h('button', { onclick: () => go('home') }, icon('printer', 'sm'), 'Imprimir')),
    (navBtns.printer = h('button', { onclick: () => go('printer') }, icon('settings', 'sm'), 'Impresora')));
  const top = h('header.topbar',
    h('div.brand', h('span.brand-mark', { html: MARK }), h('span.brand-name', 'Duplex Assistant ', h('span', '· doble cara fácil'))),
    nav,
    h('div.spacer'),
    h('button.printer-pill', { onclick: () => go('printer'), title: 'Impresora en uso' }, pillDot, icon('printer', 'sm'), pillName));
  const foot = h('footer.footer',
    h('span.made', 'Desarrollado por', h('img', { src: logoSafeTech, alt: 'SafeTech' })),
    h('a', { href: '#', onclick: (e) => { e.preventDefault(); app.api.openExternal('https://safe-tech.cl/'); } }, 'safe-tech.cl'),
    h('div.spacer'),
    h('a', { href: '#', onclick: (e) => { e.preventDefault(); app.api.openExternal('https://github.com/psgonzalogr/duplex-assistant/'); } }, 'Ayuda y código'),
    h('span.tnum', { id: 'ver' }, ''));
  clear(document.getElementById('app'), top, main, foot);
}

function renderPill() {
  pillName.textContent = S.printer ? `${S.printer}${S.profile?.calibrated ? '' : ' · sin calibrar'}` : 'Sin impresora';
  pillDot.className = `dot ${S.profile?.calibrated ? 'ok' : 'warn'}`;
}

function go(view, opts = {}) {
  app.current?.destroy?.();
  app.current = null;
  S.view = view;
  if (opts.returnTo) S.returnTo = opts.returnTo;
  if (view === 'home' && !opts.keepSelection && S.lastJobDone) { /* se mantiene la selección */ }
  for (const [k, b] of Object.entries(navBtns)) b.setAttribute('aria-current', k === view ? 'page' : 'false');
  const busy = view === 'run' || view === 'calibrate';
  Object.values(navBtns).forEach((b) => (b.disabled = busy));
  if (view === 'home') app.current = mountHome(main, app);
  else if (view === 'printer') app.current = mountPrinter(main, app);
  else if (view === 'run') runPrint(main, app, opts.job).catch(fail);
  else if (view === 'calibrate') runCalibration(main, app).catch(fail);
  if (!busy) refreshProfile();
}

function fail(e) {
  console.error(e);
  toast(e.message || String(e), 'warn');
  go('home');
}

async function refreshProfile() {
  if (!S.printer) { S.profile = null; renderPill(); return; }
  S.profile = await app.api.printerProfile(S.printer);
  renderPill();
  app.current?.onPrinter?.();
}

async function setPrinter(name) {
  S.printer = name;
  await app.api.setLastPrinter(name);
  await refreshProfile();
}

async function loadPrinters() {
  S.printers = await app.api.printers();
  const names = S.printers.map((p) => p.name);
  const pref = [S.info.lastPrinter, S.printers.find((p) => /brother|dcp|epson|hp|canon/i.test(p.name))?.name, S.printers.find((p) => p.isDefault)?.name, names[0]];
  S.printer = pref.find((n) => n && names.includes(n)) || null;
  await refreshProfile();
}

let unsub;
async function rescan() {
  unsub?.();
  S.files = [];
  S.scanning = true;
  app.current?.onFiles?.();
  let pending = false;
  unsub = app.api.onScanBatch((files) => {
    S.files.push(...files);
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => { pending = false; app.current?.onFiles?.(); });
    }
  });
  try { await app.api.scan(); } finally {
    S.scanning = false;
    app.current?.onFiles?.();
  }
}

async function start() {
  shell();
  S.info = await app.api.info();
  document.getElementById('ver').textContent = `v${S.info.version}`;
  document.documentElement.dataset.platform = S.info.platform;
  await loadPrinters();
  const params = new URLSearchParams(location.search);
  if (params.has('selftest')) {
    const { selftest } = await import('./selftest.js');
    return selftest(app, params.get('selftest'));
  }
  go('home');
  rescan();
}

start().catch((e) => {
  console.error(e);
  document.body.append(h('pre', { style: { color: '#fca5a5', padding: '20px' } }, String(e.stack || e)));
});
