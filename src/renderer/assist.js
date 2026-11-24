// Exportación asistida: abrir el documento en un programa de oficina, que la persona lo exporte a PDF y
// recoger ese PDF solo. Sirve para WPS y cualquier programa que no se pueda automatizar, o cuando la
// conversión automática falló o no se parece al original.
import { h, icon, clear, toast } from './ui.js';

/**
 * file: { path, name }. onDone(prepared) recibe el PDF listo; onCancel() cierra el panel (opcional).
 */
export function assistPanel(app, file, { onDone, onCancel, title } = {}) {
  const { api } = app;
  const root = h('div.assist');
  const base = file.name.replace(/\.[^.]+$/, '');
  let timer = null;
  let since = 0;
  let chosen = null;
  let apps = [];

  const stop = () => { clearTimeout(timer); timer = null; };
  const done = (res) => { stop(); onDone(res); };

  async function poll() {
    timer = null;
    if (!root.isConnected) return; // se cambió de documento o de pantalla
    try {
      const res = await api.findExportedPdf(file.path, since, chosen?.name);
      if (res) { toast(`Listo: uso el PDF que exportaste desde ${chosen?.name || 'tu programa'}.`); return done(res); }
    } catch { /* se reintenta */ }
    timer = setTimeout(poll, 1500);
  }

  async function choose(a) {
    chosen = a;
    since = Date.now();
    try {
      await api.openInOffice(a.id, file.path);
    } catch (e) {
      toast(`No pude abrir ${a.name}: ${e.message}`, 'warn');
      return;
    }
    renderWaiting();
    stop();
    timer = setTimeout(poll, 1500);
  }

  async function pickManual() {
    const res = await api.pickExportedPdf(file.path).catch((e) => { toast(e.message, 'warn'); return null; });
    if (res) done(res);
  }

  function renderChoices() {
    stop();
    clear(root,
      h('div', h('strong.assist-title', title || 'Ábrelo en tu programa de oficina y expórtalo a PDF'),
        h('p.hint', { style: { margin: '6px 0 0' } }, 'Elige el programa. Cuando se abra, expórtalo como PDF en la misma carpeta y con el mismo nombre: la app lo detecta sola y sigue.')),
      h('div.assist-apps', apps.map((a) =>
        h('button.btn', { class: a.id === 'default' ? 'ghost' : '', onclick: () => choose(a) }, icon('external', 'sm'), a.id === 'default' ? 'Abrir con el programa predeterminado' : `Abrir en ${a.name}`))),
      h('div.assist-row',
        h('button.btn.ghost.sm', { onclick: pickManual }, icon('folderOpen', 'sm'), 'Ya tengo el PDF: elegirlo'),
        onCancel ? h('button.btn.ghost.sm', { onclick: () => { stop(); onCancel(); } }, 'Cancelar') : null));
  }

  function renderWaiting() {
    clear(root,
      h('div.assist-wait',
        h('span.pulse-dot'),
        h('div',
          h('strong.assist-title', `Esperando el PDF de «${base}»…`),
          h('ol.assist-steps',
            h('li', `Se abrió en ${chosen.name}${chosen.id === 'default' ? '' : ''}.`),
            h('li', chosen.hint),
            h('li', { html: `Guárdalo en la misma carpeta, como <b>${base.replace(/[&<>]/g, '')}.pdf</b>.` }),
            h('li', 'Vuelve aquí: la app lo detecta sola en unos segundos.')))),
      h('div.assist-row',
        h('button.btn.ghost.sm', { onclick: pickManual }, icon('folderOpen', 'sm'), 'Ya lo exporté: elegir el PDF'),
        h('button.btn.ghost.sm', { onclick: renderChoices }, icon('chevronLeft', 'sm'), 'Usar otro programa'),
        onCancel ? h('button.btn.ghost.sm', { onclick: () => { stop(); onCancel(); } }, 'Cancelar') : null));
  }

  clear(root, h('p.hint', 'Buscando tus programas de oficina…'));
  api.officeApps(file.path).then((list) => { apps = list || []; renderChoices(); }).catch(() => { apps = []; renderChoices(); });
  return root;
}
