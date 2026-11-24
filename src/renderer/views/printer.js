// Ajustes de la impresora: calibración, papel, color, bandeja y opciones del driver.
import { h, icon, clear, toast } from '../ui.js';
import { paperGuide, faceWord, isTop } from '../scenes.js';
import { saveFeed } from './calibrate.js';
import { optionLabel, choiceLabel, optionHint, optionRecommended } from '../cups-es.js';

const OUTPUTS = [
  ['', 'No lo sé todavía (se pregunta al imprimir)'],
  ['up-in', 'Se ve lo impreso, con la parte de arriba hacia la impresora'],
  ['up-out', 'Se ve lo impreso, con la parte de arriba hacia mí'],
  ['down', 'Se ve el lado en blanco'],
];

const FEEDS = [
  ['', 'No lo sé todavía (se pregunta al imprimir)'],
  ['bottom', 'Por abajo: cajón o bandeja, hojas acostadas'],
  ['top', 'Por arriba: alimentador atrás, hojas de pie'],
];

const PAPERS = [['auto', 'Según el documento'], ['letter', 'Carta'], ['legal', 'Oficio (Legal)'], ['A4', 'A4'], ['A5', 'A5']];
const COLORS = [['auto', 'Lo que diga la impresora'], ['color', 'Color'], ['monochrome', 'Blanco y negro']];

export function mountPrinter(root, app) {
  const { S, api } = app;
  const body = h('div.settings-inner');
  clear(root, h('div.settings.view', body));

  async function render() {
    const prof = S.printer ? await api.printerProfile(S.printer) : null;
    S.profile = prof;
    const win = S.info.platform === 'win32';

    const select = h('select.field', { 'aria-label': 'Impresora', onchange: async () => { await app.setPrinter(select.value); render(); } },
      S.printers.map((p) => h('option', { value: p.name, selected: p.name === S.printer }, p.displayName)));

    const head = h('div.settings-head',
      h('div', { style: { flex: '1' } }, h('h1', 'Impresora'), h('p', 'La calibración y los ajustes se guardan por separado para cada impresora.')),
      h('div', { style: { width: '360px' } }, select));

    if (!prof) {
      clear(body, head, h('div.card.span', h('div.note.warn', icon('alert'), h('div', h('strong', 'No encontré impresoras'),
        h('p', win ? 'Instala tu impresora en Configuración › Bluetooth y dispositivos › Impresoras y escáneres, y vuelve a abrir esta pantalla.' : 'Configura tu impresora en CUPS (por ejemplo con system-config-printer) y vuelve a abrir esta pantalla.')))));
      return;
    }

    const cal = h('div.card',
      h('h3', h('span.ib', icon('sparkles')), 'Calibración'),
      prof.calibrated
        ? h('div.note.ok', icon('circleCheck'), h('p', 'Calibrada. La app sabe cómo dar vuelta los reversos en esta impresora.'))
        : h('div.note.warn', icon('alert'), h('p', 'Todavía no está calibrada. Usa 2 hojas de prueba y toma un minuto.')),
      prof.calibrated && typeof prof.stackReversed !== 'boolean'
        ? h('div.note.info', icon('info'), h('p', 'Vuelve a calibrar: ahora la app también aprende en qué orden se apilan las hojas, para que el mazo termine ordenado con la página 1 arriba y no tengas que girar hojas.'))
        : null,
      h('dl.kv',
        h('dt', 'El papel entra'), h('dd', prof.feed === 'top' ? 'Por arriba (alimentador)' : prof.feed === 'bottom' ? 'Por abajo (cajón o bandeja)' : 'Sin dato'),
        h('dt', 'Mazo al darlo vuelta'), h('dd', `Cara impresa ${faceWord(prof)}`),
        h('dt', 'Orden de los reversos'), h('dd', `${prof.effectiveInvert ? 'Invertido' : 'Normal'}${prof.outputFace ? (prof.invertFix ? ' (corregido por la calibración)' : ' (según el movimiento)') : ''}`),
        h('dt', 'Reversos girados 180°'), h('dd', prof.rotate ? 'Sí' : 'No'),
        h('dt', 'Mazo al terminar'), h('dd', typeof prof.stackReversed === 'boolean' && prof.outputFace ? 'Ordenado, con la página 1 arriba' : 'Sin medir'),
        h('dt', 'Velocidad medida'), h('dd', `~${prof.secPerSheet} s por cara`)),
      h('button.btn.primary', { onclick: () => app.go('calibrate', { returnTo: 'printer' }) }, icon('sparkles'), prof.calibrated ? 'Volver a calibrar' : 'Calibrar ahora'));

    const capInput = h('input.field.tnum', { type: 'number', min: '5', max: '500', value: String(prof.capacity) });
    capInput.addEventListener('change', async () => {
      const v = Math.min(500, Math.max(5, parseInt(capInput.value, 10) || 100));
      capInput.value = String(v);
      S.profile = await api.updatePrinter(S.printer, { capacity: v });
      toast(`Guardado: lotes de hasta ${v} hojas.`);
    });
    const tray = h('div.card',
      h('h3', h('span.ib', icon('layers')), isTop(prof) ? 'Alimentador' : 'Bandeja'),
      h('div', h('label.label', 'Hojas que caben de una vez'), capInput,
        h('p.hint', 'Si un trabajo necesita más hojas, la app lo divide en lotes y te avisa cuándo poner papel nuevo. La Brother DCP-T710W admite unas 150 hojas; 100 deja margen.')));

    const paperSel = h('select.field', { onchange: async () => { S.profile = await api.updatePrinter(S.printer, { paper: paperSel.value }); toast('Tamaño de papel guardado.'); } },
      PAPERS.map(([v, l]) => h('option', { value: v, selected: prof.paper === v }, l)));
    const colorSel = h('select.field', { onchange: async () => { S.profile = await api.updatePrinter(S.printer, { color: colorSel.value }); toast('Color guardado.'); } },
      COLORS.map(([v, l]) => h('option', { value: v, selected: prof.color === v }, l)));

    let driverCard;
    if (win) {
      driverCard = h('div.card.span',
        h('h3', h('span.ib', icon('sliders')), 'Papel, color y calidad'),
        h('div.row2',
          h('div', h('label.label', 'Tamaño de papel'), paperSel),
          h('div', h('label.label', 'Color'), colorSel)),
        h('div.note.info', icon('info'), h('div',
          h('strong', 'Calidad, tipo de papel y más'),
          h('p', 'Abre la ventana de la propia impresora. Lo que elijas se guarda solo para Duplex Assistant: Word, Acrobat y los demás programas siguen con su configuración. Deja la impresión a 2 caras en «Ninguno»: de eso se encarga esta app.'))),
        h('div.stage-actions',
          h('button.btn', { onclick: openDriver }, icon('settings'), 'Abrir ajustes de la impresora…'),
          prof.driverProfile ? h('span.pill.ok', icon('check', 'sm'), 'Ajustes propios guardados') : h('span.pill.neutral', 'Usando los ajustes de Windows'),
          prof.driverProfile ? h('button.btn.ghost.sm', { onclick: async () => { await api.resetDriverSettings(S.printer); toast('Volviste a los ajustes de Windows.'); render(); } }, 'Quitar ajustes propios') : null));
    } else {
      driverCard = h('div.card.span', h('h3', h('span.ib', icon('sliders')), 'Opciones de la impresora (CUPS)'), h('p.hint', { style: { margin: 0 } }, 'Cargando opciones del driver…'));
      loadCups(driverCard, prof);
    }

    const guideSlot = h('div');
    const drawGuide = () => clear(guideSlot, paperGuide(S.profile));
    const outSel = h('select.field', {
      'aria-label': 'Cómo salen las hojas',
      onchange: async () => {
        S.profile = await api.updatePrinter(S.printer, { outputFace: outSel.value || null });
        drawGuide();
        toast('Guardado. La animación ya muestra el movimiento para tu impresora.');
      },
    }, OUTPUTS.map(([v, l]) => h('option', { value: v, selected: (prof.outputFace || '') === v }, l)));
    const feedSel = h('select.field', {
      'aria-label': 'Por dónde entra el papel',
      onchange: async () => {
        if (!feedSel.value) return;
        const before = S.profile.feed;
        S.profile = await saveFeed(api, S.printer, feedSel.value, { keepCalibration: true });
        toast(before && before !== feedSel.value && S.profile.calibrated ? 'Guardado. Como cambió el lugar del papel, conviene volver a calibrar.' : 'Guardado.');
        render();
      },
    }, FEEDS.map(([v, l]) => h('option', { value: v, selected: (prof.feed || '') === v, disabled: v === '' && !!prof.feed }, l)));
    const faceSel = h('select.field', {
      'aria-label': 'Cómo va el mazo',
      onchange: async () => {
        S.profile = await api.updatePrinter(S.printer, { faceUp: faceSel.value === 'up' });
        drawGuide();
        toast('Guardado.');
      },
    }, h('option', { value: 'up', selected: prof.faceUp }, `Con lo impreso ${faceWord(prof, true)}`), h('option', { value: 'down', selected: !prof.faceUp }, `Con lo impreso ${faceWord(prof, false)}`));
    const guideCard = h('div.card.span',
      h('h3', h('span.ib', icon('flip')), 'Cómo poner el papel para los reversos'),
      h('div', h('label.label', 'El papel entra…'), feedSel),
      h('div.row2',
        h('div', h('label.label', 'Cuando salen las hojas…'), outSel),
        h('div', h('label.label', isTop(prof) ? 'En el alimentador van…' : 'En la bandeja van…'), faceSel, h('p.hint', 'Lo averigua la calibración; cámbialo solo si sabes que es distinto.'))),
      guideSlot);
    drawGuide();

    clear(body, head, cal, tray, guideCard, driverCard);
  }

  async function openDriver() {
    toast('Se abrió la ventana de la impresora. Ciérrala con «Aceptar» para guardar.');
    try {
      await api.driverSettings(S.printer);
      toast('Ajustes de la impresora guardados para Duplex Assistant.');
    } catch (e) { toast(e.message, 'warn'); }
    render();
  }

  async function loadCups(card, prof) {
    let res;
    try { res = await api.printerOptions(S.printer); } catch (e) { res = { options: [], error: e.message }; }
    const grid = h('div.cups-grid');
    const selects = new Map();
    const save = async (key, value) => {
      const cups = { ...S.profile.cups, [key]: value || undefined };
      if (!value) delete cups[key];
      S.profile = await api.updatePrinter(S.printer, { cups });
    };
    for (const o of res.options) {
      const label = optionLabel(o.key, o.label);
      const rec = optionRecommended(o.key);
      const hint = optionHint(o.key);
      const cur = prof.cups[o.key] || '';
      const text = (c) => `${choiceLabel(o.key, c)}${c === rec ? ' · recomendado' : ''}`;
      const sel = h('select.field', {
        'aria-label': label,
        onchange: async () => { await save(o.key, sel.value); toast(`${label}: guardado.`); },
      }, h('option', { value: '' }, `Predeterminado (${choiceLabel(o.key, o.default)})`), o.choices.map((c) => h('option', { value: c, selected: cur === c }, text(c))));
      selects.set(o.key, sel);
      grid.append(h('div', { class: rec ? 'has-rec' : '' }, h('label.label', label), sel, hint ? h('p.hint', hint) : null));
    }
    // Lo recomendado para doble cara manual (solo opciones que este driver tiene)
    const recs = res.options.filter((o) => optionRecommended(o.key) && o.choices.includes(optionRecommended(o.key)));
    const recBtn = recs.length
      ? h('button.btn.ghost.sm', {
        onclick: async () => {
          for (const o of recs) { const v = optionRecommended(o.key); await save(o.key, v); selects.get(o.key).value = v; }
          toast(`Listo: ${recs.map((o) => optionLabel(o.key, o.label).toLowerCase()).join(' y ')}.`);
        },
      }, icon('sparkles', 'sm'), 'Usar lo recomendado para doble cara manual')
      : null;
    clear(card, h('h3', h('span.ib', icon('sliders')), 'Opciones de la impresora (CUPS)'),
      res.options.length
        ? [h('p.hint', { style: { margin: 0 } }, 'Se aplican solo cuando imprimes con Duplex Assistant. La impresión a 2 caras la maneja esta app, por eso no aparece aquí.'), recBtn ? h('div', recBtn) : null, grid]
        : h('div.note.warn', icon('alert'), h('p', res.error || 'CUPS no informó opciones para esta impresora. Se usará su configuración predeterminada.')));
  }

  render();
  return { onPrinter: render, destroy() {} };
}
