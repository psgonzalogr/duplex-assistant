'use strict';
// Conversión a PDF con las apps de oficina de ArtCraft (WordCraft, DeckCraft, GridCraft).
// No tienen conversión por línea de comandos en las versiones que se instalan, pero sí un servidor de
// control local (--control PUERTO): se abre la app, se le pide abrir el documento y exportarlo a PDF,
// y se cierra. La ventana aparece unos segundos.
//
// El protocolo cambió entre versiones y cada app lo implementa a su manera; este cliente acepta los tres:
//  · token por conexión: primera línea {"method":"auth","params":{"token":…}} (WordCraft nuevo, GridCraft)
//  · clave en cada pedido: {"key":…, "method":…} (WordCraft 0.18)
//  · sin token (DeckCraft)
// El token se le entrega a la app por variable de entorno; si la versión la ignora, se lee el archivo que escribe.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

// Cómo abrir y exportar en cada app (probado con WordCraft 0.18.1, DeckCraft 0.18.1, GridCraft 0.19.1).
const APPS = {
  wordcraft: {
    name: 'WordCraft', kinds: ['word'],
    open: (p) => ['engine.execute', { command: 'file.open', params: { path: p } }],
    export: (out) => ['engine.execute', { command: 'file.save', params: { path: out } }],
  },
  deckcraft: {
    name: 'DeckCraft', kinds: ['powerpoint'],
    open: (p) => ['app.open', { path: p }],
    export: (out) => ['app.export', { path: out }],
  },
  gridcraft: {
    name: 'GridCraft', kinds: ['excel'],
    open: (p) => ['app.open', { path: p }],
    export: (out) => ['engine.execute', { command: 'file.exportPdf', params: { path: out, sheets: 'all' } }],
  },
};

const DENIED = new Set(['unauthorized', 'authentication required']);

function versionOf(name) {
  const m = /-(\d+)\.(\d+)\.(\d+)/.exec(name);
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}
const newer = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };

/** Ejecutable de la app: la AppImage más nueva de ~/Applications (donde la deja el ArtCraft Launcher) o el comando instalado. */
function findCraft(app) {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const Name = APPS[app].name;
    for (const c of [path.join(local, 'Programs', Name, `${app}.exe`), path.join(process.env.ProgramFiles || 'C:\\Program Files', Name, `${app}.exe`)]) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }
  let best = null, bestV = null;
  for (const dir of [path.join(home, 'Applications'), path.join(home, 'Aplicaciones'), path.join(home, '.local', 'bin')]) {
    let list = [];
    try { list = fs.readdirSync(dir); } catch { continue; }
    for (const f of list) {
      if (!new RegExp(`^${app}[-_].*\\.appimage$`, 'i').test(f)) continue;
      const v = versionOf(f);
      if (!best || newer(v, bestV)) { best = path.join(dir, f); bestV = v; }
    }
  }
  if (best) return best;
  for (const c of [path.join(home, '.local', 'bin', app), `/usr/bin/${app}`, `/usr/local/bin/${app}`, `/opt/${app}/${app}`]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** Apps de ArtCraft que sirven para este tipo de documento. */
function craftsFor(kind) {
  return Object.keys(APPS).filter((a) => APPS[a].kinds.includes(kind)).map((a) => ({ app: a, name: APPS[a].name, bin: findCraft(a) })).filter((x) => x.bin);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

/** Un pedido por conexión: [auth?] + pedido → respuesta. */
function request(port, lines, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1');
    let buf = '';
    const replies = [];
    const t = setTimeout(() => { s.destroy(); reject(new Error('La app no respondió a tiempo.')); }, timeout);
    s.on('connect', () => s.write(lines.map((l) => JSON.stringify(l)).join('\n') + '\n'));
    s.on('data', (d) => {
      buf += d;
      let k;
      while ((k = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, k); buf = buf.slice(k + 1);
        try { replies.push(JSON.parse(line)); } catch { replies.push({ ok: false, error: 'bad reply' }); }
        // Si la autenticación falló, el servidor cierra: no habrá más respuestas
        if (replies.length === lines.length || (lines.length > 1 && replies.length === 1 && replies[0].ok === false)) {
          clearTimeout(t); s.end(); resolve(replies);
        }
      }
    });
    s.on('error', (e) => { clearTimeout(t); reject(e); });
    s.on('close', () => { clearTimeout(t); resolve(replies); });
  });
}

/** Cliente que descubre solo qué forma de autenticación usa esta versión de la app. */
function client(port, tokens) {
  let mode = null, tok = null, id = 0;
  return async function call(method, params) {
    const req = { id: ++id, method, params };
    if (!mode) {
      for (const t of tokens) {
        const [r] = await request(port, [{ id: 0, method: 'auth', params: { token: t } }], 15000);
        if (r?.ok) { mode = 'auth'; tok = t; break; }
      }
      if (!mode) {
        for (const t of tokens) {
          const [r] = await request(port, [{ ...req, key: t }]);
          if (r && !DENIED.has(r.error)) { mode = 'key'; tok = t; return r; }
        }
        mode = 'none';
      }
    }
    if (mode === 'auth') return (await request(port, [{ id: 0, method: 'auth', params: { token: tok } }, req]))[1];
    if (mode === 'key') return (await request(port, [{ ...req, key: tok }]))[0];
    return (await request(port, [req]))[0];
  };
}

function tokenFiles(app, port) {
  const home = os.homedir();
  const cfg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const run = process.env.XDG_RUNTIME_DIR || os.tmpdir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return [
    path.join(cfg, app, `control-key.local-${port}`),
    path.join(run, app, `control-${port}.token`),
    path.join(appData, APPS[app].name, `control-key.local-${port}`),
  ];
}

/** Convierte con una app de ArtCraft. Lanza error si no lo logra (la app se cierra igual). */
async function craftToPdf(app, bin, file, outPdf) {
  const spec = APPS[app];
  const port = await freePort();
  const token = crypto.randomBytes(32).toString('hex');
  const env = { ...process.env, [`${app.toUpperCase()}_CONTROL_TOKEN`]: token };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(bin, ['--control', String(port)], { env, stdio: 'ignore', windowsHide: false });
  let exited = false;
  child.on('exit', () => { exited = true; });
  try {
    const t0 = Date.now();
    while (!(await canConnect(port))) {
      if (exited) throw new Error(`${spec.name} se cerró al abrir (¿ya estaba abierto?).`);
      if (Date.now() - t0 > 30000) throw new Error(`${spec.name} no abrió su canal de control.`);
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, 400));
    const files = tokenFiles(app, port).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8').trim());
    const call = client(port, [token, ...files.filter((t) => t && t !== token)]);
    const step = async ([method, params], what) => {
      const r = await call(method, params);
      if (!r?.ok) throw new Error(`${spec.name} no pudo ${what}: ${r?.error || 'sin respuesta'}`);
      return r.result;
    };
    await step(spec.open(file), 'abrir el documento');
    await step(spec.export(outPdf), 'exportarlo a PDF');
    const st = fs.existsSync(outPdf) ? fs.statSync(outPdf) : null;
    if (!st || st.size < 100) throw new Error(`${spec.name} no generó el PDF.`);
    try { await call('app.quit', { force: true }); } catch { /* se cierra abajo */ }
  } finally {
    // Si no se cerró sola, se cierra: nunca queda una ventana colgada
    setTimeout(() => { if (!exited) try { child.kill(); } catch { /* ya salió */ } }, 5000);
  }
}

module.exports = { APPS, findCraft, craftsFor, craftToPdf };
