// «La impresora tomó 2 hojas juntas»: pasa en muchas impresoras al volver a pasar hojas recién impresas
// (tinta húmeda, papel curvo o con estática). La app no puede evitarlo, pero sí no guardar una calibración
// equivocada, dejar de imprimir reversos corridos y explicar cómo prevenirlo.
import { h, icon } from './ui.js';
import { openFeedback } from './feedback.js';

export const DOUBLE_ACTION = { key: 'double', label: 'Tomó 2 hojas juntas', icon: 'alert', cancel: true };

/** Consejos para que no vuelva a pasar. */
export function doubleFeedTips() {
  return h('div.note.info.tips', icon('info'), h('div',
    h('strong', 'Para que no vuelva a pasar'),
    h('ul',
      h('li', 'Antes de volver a poner las hojas, espera unos segundos a que se seque la tinta.'),
      h('li', 'Airéalas: sepáralas una por una y vuelve a juntarlas bien alineadas.'),
      h('li', 'Si quedaron curvas, endérezalas con la mano.'),
      h('li', 'Si te pasa seguido, prueba con papel un poco más grueso (75 a 80 g/m²).'))));
}

/**
 * Muestra qué pasó y qué hacer. context: 'cal' (calibración) | 'run' (impresión).
 * Devuelve 'retry' (repetir) o 'quit' (terminar, solo en impresión).
 */
export async function doubleFeedStage(flow, app, { context, cancelled = false, finished = false, sheets = 0, place = 'la bandeja' } = {}) {
  const cal = context === 'cal';
  // finished: ya terminó de imprimir (se avisó después); si no, se intentó quitar el resto de la cola
  const stopped = finished ? 'Pasa a veces con hojas recién impresas.'
    : cancelled ? 'Detuve lo que quedaba por imprimir.'
      : 'Si la impresora sigue imprimiendo, detenla con su botón de cancelar.';
  const ctl = flow.stage({
    chip: 'act',
    chipText: 'ATENCIÓN',
    sound: 'aviso',
    voice: cal ? 'doble-cal' : 'doble-run',
    title: 'La impresora tomó 2 hojas juntas',
    lead: cal
      ? `${stopped} No guardé esta prueba, para no aprender un orden equivocado. Repitámosla con <b>2 hojas nuevas</b>.`
      : `${stopped} Desde esa hoja los reversos quedan corridos, así que conviene repetir este lote: saca sus hojas y pon <b>${sheets} hojas nuevas</b> en ${place}.`,
    note: doubleFeedTips(),
    // Avisar no cierra el paso: abre el correo y se puede seguir
    body: h('div.report-row', h('button.btn.ghost.sm', {
      onclick: () => openFeedback(app, { topic: `La impresora tomó 2 hojas juntas al imprimir ${cal ? 'los reversos de la calibración' : 'los reversos'}.` }),
    }, icon('feedback', 'sm'), 'Avisar a SafeTech de este problema')),
    actions: [
      { key: 'retry', label: cal ? 'Repetir la prueba' : 'Repetir este lote', primary: true, icon: 'refresh' },
      ...(cal ? [] : [{ key: 'quit', label: 'Terminar aquí', ghost: true }]),
    ],
  });
  return ctl.wait();
}
