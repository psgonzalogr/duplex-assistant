import { h, icon, clear, toast } from './ui.js';
import { mountHome } from './views/home.js';
import { mountPrinter } from './views/printer.js';
import { runPrint } from './views/run.js';
import { runCalibration } from './views/calibrate.js';
import logoSafeTech from '../../assets/logo-safetech-dark.png';
import { createUpdater } from './update.js';
import { MARK } from './brand.js';
import { mountWelcome } from './views/welcome.js';
import { startTour } from './tour.js';
import { configure, onAudioChange, audioState, say, play } from './audio.js';


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
  applySettings,
  startTour: runTour,
  afterOnboarding,
};

// ---------- armazón ----------
const navBtns = {};
const pillName = h('span.name');
const pillDot = h('span.dot');
const main = h('main');

function shell() {
  const nav = h('nav.nav', { 'aria-label': 'Secciones' },
    (navBtns.home = h('button', { onclick: () => go('home') }, icon('printer', 'sm'), 'Imprimir')),
    (navBtns.printer = h('button', { 'data-nav': 'printer', onclick: () => go('printer') }, icon('settings', 'sm'), 'Impresora')));
  const top = h('header.topbar',
    h('div.brand', h('span.brand-mark', { html: MARK }), h('span.brand-name', 'Duplex Assistant ', h('span', '· doble cara fácil'))),
    nav,
    h('div.spacer'),
    app.updater.pill,
    audioControls(),
    h('button.printer-pill', { onclick: () => go('printer'), title: 'Impresora en uso' }, pillDot, icon('printer', 'sm'), pillName));
  const foot = h('footer.footer',
    h('span.made', 'Desarrollado por', h('img', { src: logoSafeTech, alt: 'SafeTech' })),
    h('a', { href: '#', onclick: (e) => { e.preventDefault(); app.api.openExternal('https://safe-tech.cl/'); } }, 'safe-tech.cl'),
    h('div.spacer'),
    h('button.linkish', { onclick: () => app.updater.checkNow() }, 'Buscar actualizaciones'),
    h('a', { href: '#', onclick: (e) => { e.preventDefault(); app.api.openExternal('https://github.com/psgonzalogr/duplex-assistant/'); } }, 'Ayuda y código'),
    h('span.tnum', { id: 'ver' }, ''));
  clear(document.getElementById('app'), top, main, foot);
}

function renderPill() {
  pillName.textContent = S.printer ? `${S.printer}${S.profile?.calibrated ? '' : ' · sin calibrar'}` : 'Sin impresora';
  pillDot.className = `dot ${S.profile?.calibrated ? 'ok' : 'warn'}`;
  pillName.title = S.profile?.riskAccepted && !S.profile?.calibrated ? 'Sin calibrar (aceptaste el riesgo)' : '';
}

function go(view, opts = {}) {
  app.current?.destroy?.();
  app.current = null;
  S.view = view;
  if (opts.returnTo) S.returnTo = opts.returnTo;
  S.calSkipFirst = !!opts.skipFirst;
  if (view === 'home' && !opts.keepSelection && S.lastJobDone) { /* se mantiene la selección */ }
  for (const [k, b] of Object.entries(navBtns)) b.setAttribute('aria-current', k === view ? 'page' : 'false');
  const busy = view === 'run' || view === 'calibrate';
  Object.values(navBtns).forEach((b) => (b.disabled = busy));
  app.updater?.setBusy(busy);
  if (view === 'welcome') { Object.values(navBtns).forEach((b) => (b.disabled = true)); app.current = mountWelcome(main, app); return; }
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
  S.info = await app.api.info();
  app.updater = createUpdater(app);
  shell();
  document.getElementById('ver').textContent = `v${S.info.version}`;
  document.documentElement.dataset.platform = S.info.platform;
  S.settings = await app.api.settings();
  applySettings();
  await loadPrinters();
  const params = new URLSearchParams(location.search);
  if (params.has('selftest')) {
    const { selftest } = await import('./selftest.js');
    return selftest(app, params.get('selftest'));
  }
  if (!S.settings.onboarded) go('welcome');
  else go('home');
  rescan();
}

start().catch((e) => {
  console.error(e);
  document.body.append(h('pre', { style: { color: '#fca5a5', padding: '20px' } }, String(e.stack || e)));
});

// ---------- voz, sonidos y primer inicio ----------
function applySettings() {
  configure({ voice: S.settings.voice !== false, sounds: S.settings.sounds !== false });
}

function audioControls() {
  const voiceBtn = h('button', { title: 'Activar o silenciar la guía por voz', onclick: () => toggleAudio('voice') });
  const soundBtn = h('button', { title: 'Activar o silenciar los sonidos', onclick: () => toggleAudio('sounds') });
  const helpBtn = h('button.help-btn', { title: 'Ver el recorrido por la app', 'aria-label': 'Ver el recorrido por la app', onclick: () => runTour() }, icon('help', 'sm'));
  const render = (s) => {
    voiceBtn.setAttribute('aria-pressed', String(s.voice));
    voiceBtn.replaceChildren(icon(s.voice ? 'volumeOn' : 'volumeOff', 'sm'), h('span.lbl', 'Voz'));
    soundBtn.setAttribute('aria-pressed', String(s.sounds));
    soundBtn.replaceChildren(icon(s.sounds ? 'bell' : 'bellOff', 'sm'), h('span.lbl', 'Sonidos'));
  };
  render(audioState());
  onAudioChange(render);
  return h('div.audio-controls', { role: 'group', 'aria-label': 'Voz y sonidos' }, voiceBtn, soundBtn, helpBtn);
}

async function toggleAudio(key) {
  S.settings = await app.api.setSettings({ [key]: !(S.settings[key] !== false) });
  applySettings();
  if (key === 'voice' && S.settings.voice) say('voz-activada');
  if (key === 'sounds' && S.settings.sounds) play('exito');
  toast(key === 'voice' ? (S.settings.voice ? 'Guía por voz activada.' : 'Guía por voz silenciada.') : (S.settings.sounds ? 'Sonidos activados.' : 'Sonidos silenciados.'));
}

function runTour({ firstRun = false } = {}) {
  if (S.view !== 'home') go('home');
  setTimeout(() => startTour({ onEnd: () => { if (firstRun) afterOnboarding(); } }), 250);
}

/** Al terminar la bienvenida: la calibración es obligatoria (se puede saltar aceptando el riesgo). */
async function afterOnboarding() {
  S.settings = await app.api.setSettings({ onboarded: true });
  if (!S.printer) return toast('No encontré impresoras. Instala tu impresora y luego calíbrala en «Impresora».', 'warn');
  const p = await app.api.printerProfile(S.printer);
  if (!p.calibrated && !p.riskAccepted) go('calibrate', { returnTo: 'home' });
}