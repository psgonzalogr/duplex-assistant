// Aviso de actualización: tarjeta abajo a la derecha + botón en la barra superior.
import { h, icon, clear, toast } from './ui.js';

export function createUpdater(app) {
  const api = app.api;
  let state = { status: 'idle' };
  let dismissed = false;
  let busy = false;
  let manualCheck = false;

  const card = h('section.update-card', { role: 'dialog', 'aria-live': 'polite', 'aria-label': 'Actualización disponible', hidden: true });
  const pillText = h('span');
  const pill = h('button.update-pill', { hidden: true, onclick: () => { dismissed = false; render(); } }, icon('sparkles', 'sm'), pillText);
  document.body.append(card);

  const mb = (b) => `${Math.round((b || 0) / 1048576)} MB`;

  function render() {
    const s = state;
    const has = ['available', 'downloading', 'ready', 'error'].includes(s.status);
    pill.hidden = !has || !dismissed;
    pillText.textContent =s.status === 'ready' ? 'Lista para instalar' : `Nueva versión ${s.version || ''}`.trim();
    card.hidden = !has || dismissed || busy;
    if (card.hidden) return;

    const close = h('button.btn.ghost.icon-only.sm.uc-close', { 'aria-label': 'Ocultar', onclick: () => { dismissed = true; render(); } }, icon('x', 'sm'));
    if (s.status === 'available') {
      clear(card, close,
        h('div.uc-head', h('span.uc-ic', icon('sparkles')), h('div', h('b', 'Hay una versión nueva'), h('span', `Duplex Assistant ${s.version} · tienes la ${app.S.info.version}`))),
        s.notes ? h('p.uc-notes', s.notes) : null,
        h('div.uc-actions',
          h('button.btn.primary.sm', { onclick: () => api.downloadUpdate() }, icon('arrowUp', 'sm'), 'Actualizar'),
          h('button.btn.ghost.sm', { onclick: () => { dismissed = true; render(); } }, 'Después')));
    } else if (s.status === 'downloading') {
      const pct = Math.max(0, Math.min(100, s.percent || 0));
      clear(card,
        h('div.uc-head', h('span.uc-ic.wait', icon('hourglass')), h('div', h('b', `Descargando la versión ${s.version || ''}`.trim()), h('span', 'Puedes seguir usando la app mientras tanto.'))),
        h('div.progress', h('div.track.thin', h('div.fill', { style: { width: `${pct}%` } })),
          h('div.progress-meta', h('span', `${Math.round(pct)} %`), h('span', s.total ? `${mb(s.transferred)} de ${mb(s.total)}` : ''))));
    } else if (s.status === 'ready') {
      clear(card, close,
        h('div.uc-head', h('span.uc-ic.ok', icon('check')), h('div', h('b', 'Actualización lista'), h('span', `Se instala la versión ${s.version} y la app se vuelve a abrir sola.`))),
        h('div.uc-actions',
          h('button.btn.primary.sm', { onclick: () => api.installUpdate() }, icon('refresh', 'sm'), 'Reiniciar y actualizar'),
          h('button.btn.ghost.sm', { onclick: () => { dismissed = true; render(); } }, 'Más tarde')));
    } else if (s.status === 'error') {
      clear(card, close,
        h('div.uc-head', h('span.uc-ic.warn', icon('alert')), h('div', h('b', 'No se pudo actualizar'), h('span', s.error || 'Inténtalo de nuevo más tarde.'))),
        h('div.uc-actions', h('button.btn.sm', { onclick: () => api.downloadUpdate() }, icon('refresh', 'sm'), 'Reintentar')));
    }
  }

  function apply(s) {
    const prev = state.status;
    state = s || { status: 'idle' };
    if (state.status === 'available' && prev !== 'available' && prev !== 'error') dismissed = false;
    if (state.status === 'ready') dismissed = false;
    if (manualCheck && state.status === 'none') { manualCheck = false; toast(`Tienes la última versión (${app.S.info.version}).`); }
    if (manualCheck && state.status === 'available') manualCheck = false;
    render();
  }

  api.onUpdate?.(apply);
  api.updateState?.().then(apply).catch(() => {});

  return {
    pill,
    setBusy(b) { busy = b; render(); },
    async checkNow() {
      const s = await api.updateState();
      if (s.status === 'unsupported') return toast('Las actualizaciones automáticas funcionan en la versión instalada (instalador de Windows o AppImage).');
      manualCheck = true;
      toast('Buscando actualizaciones…');
      apply(await api.checkUpdate());
    },
    show(s) { busy = false; dismissed = false; apply(s); }, // usado por la autoprueba
  };
}
