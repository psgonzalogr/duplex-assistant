// Tour guiado: un foco sobre cada parte de la interfaz, con su explicación y la voz.
import { h, icon } from './ui.js';
import { say, play, stopVoice } from './audio.js';

export const TOUR = [
  { voice: 'tour-inicio', title: 'Un recorrido de un minuto', text: 'Te muestro dónde está cada cosa. Avanza con «Siguiente» o sal cuando quieras.' },
  { sel: '.finder', voice: 'tour-documentos', title: 'Tus documentos', text: 'La app busca sola en Escritorio, Documentos y Descargas, y los ordena del más reciente al más antiguo.', place: 'right' },
  { sel: '.finder-head', voice: 'tour-buscar', title: 'Buscar y filtrar', text: 'Escribe parte del nombre o filtra por tipo. También puedes arrastrar cualquier archivo a la ventana.', place: 'right' },
  { sel: '.preview', voice: 'tour-vista', title: 'Vista previa', text: 'Al elegir un documento ves cada página antes de imprimir.', place: 'center' },
  { sel: '.preview-bar .segmented', fallback: '.preview', voice: 'tour-hojas', title: 'Páginas y hojas', text: 'Con «Hojas» ves cómo quedará cada hoja por delante y por detrás.', place: 'below' },
  { sel: '.stepper', voice: 'tour-copias', title: 'Copias y páginas', text: 'Elige cuántas copias y, si quieres, solo algunas páginas.', place: 'left' },
  { sel: '.panel-foot .foot-summary', fallback: '.panel-foot', voice: 'tour-resumen', title: 'Resumen', text: 'Cuántas hojas usarás y cuánto tiempo tomará, más o menos.', place: 'left' },
  { sel: '.panel-foot .btn.primary', fallback: '.panel-foot', voice: 'tour-imprimir', title: 'Imprimir a doble cara', text: 'Aprieta aquí y te guío paso a paso: cuándo esperar y cuándo dar vuelta el mazo.', place: 'left' },
  { sel: '[data-nav="printer"]', voice: 'tour-impresora', title: 'Impresora', text: 'Calibración, cómo poner el papel, calidad y tamaño de hoja.', place: 'below' },
  { sel: '.audio-controls', voice: 'tour-botones', title: 'Voz, sonidos y ayuda', text: 'Activa o silencia la voz y los sonidos. Con «?» repites este recorrido.', place: 'below' },
  { voice: 'tour-fin', title: '¡Listo!', text: 'Ahora calibremos tu impresora para que los reversos salgan siempre en su lugar.', last: true },
];

function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none';
}

/** Muestra el tour. onEnd(completed) se llama al terminar o salir. */
export function startTour({ onEnd, startAt = 0 } = {}) {
  document.querySelector('.tour')?.remove();
  let i = startAt;
  const spot = h('div.tour-spot');
  const counter = h('span.tour-count');
  const title = h('h3');
  const text = h('p');
  const back = h('button.btn.ghost.sm', { onclick: () => go(i - 1) }, icon('chevronLeft', 'sm'), 'Atrás');
  const next = h('button.btn.primary.sm', { onclick: () => go(i + 1) });
  const exit = h('button.btn.ghost.icon-only.sm.tour-exit', { 'aria-label': 'Salir del recorrido', title: 'Salir del recorrido', onclick: () => end(false) }, icon('x', 'sm'));
  const card = h('div.tour-card', { role: 'dialog', 'aria-modal': 'true', 'aria-live': 'polite' },
    exit, counter, title, text, h('div.tour-actions', back, next));
  const root = h('div.tour', h('div.tour-block'), spot, card);
  document.body.append(root);

  function place() {
    const step = TOUR[i];
    let target = step.sel ? document.querySelector(step.sel) : null;
    if (!visible(target) && step.fallback) target = document.querySelector(step.fallback);
    const W = innerWidth, H = innerHeight;
    const cw = Math.min(380, W - 32);
    card.style.width = `${cw}px`;
    if (!visible(target)) {
      spot.style.cssText = `left:${W / 2}px;top:${H / 2}px;width:0;height:0;`;
      card.style.left = `${(W - cw) / 2}px`;
      card.style.top = `${Math.max(16, H / 2 - card.offsetHeight / 2)}px`;
      root.classList.add('centered');
      return;
    }
    root.classList.remove('centered');
    const r = target.getBoundingClientRect();
    const pad = 8;
    spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;`;
    const ch = card.offsetHeight;
    let left, top;
    const pl = step.place || 'below';
    if (pl === 'right') { left = r.right + 20; top = r.top + 40; }
    else if (pl === 'left') { left = r.left - cw - 20; top = r.top; }
    else if (pl === 'center') { left = r.left + r.width / 2 - cw / 2; top = r.top + r.height / 2 - ch / 2; }
    else { left = r.left + r.width / 2 - cw / 2; top = r.bottom + 18; }
    left = Math.max(16, Math.min(W - cw - 16, left));
    top = Math.max(16, Math.min(H - ch - 16, top));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function go(n) {
    if (n < 0) return;
    if (n >= TOUR.length) return end(true);
    i = n;
    const step = TOUR[i];
    counter.textContent = `${i + 1} de ${TOUR.length}`;
    title.textContent = step.title;
    text.textContent = step.text;
    back.disabled = i === 0;
    next.replaceChildren(step.last ? icon('check', 'sm') : '', step.last ? 'Terminar' : 'Siguiente', step.last ? '' : icon('chevronRight', 'sm'));
    place();
    card.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.23,1,0.32,1)' });
    play('paso');
    say(step.voice);
    next.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (e.key === 'Escape') end(false);
    if (e.key === 'ArrowRight') go(i + 1);
    if (e.key === 'ArrowLeft') go(i - 1);
  }

  function end(completed) {
    stopVoice();
    removeEventListener('resize', place);
    removeEventListener('keydown', onKey);
    root.remove();
    onEnd?.(completed);
  }

  addEventListener('resize', place);
  addEventListener('keydown', onKey);
  requestAnimationFrame(() => go(i));
  return { go, end, place };
}
