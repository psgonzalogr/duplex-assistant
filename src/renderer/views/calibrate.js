// Calibración: 2 hojas de prueba y una pregunta visual. Guarda el perfil de la impresora.
import { h, icon, toast } from '../ui.js';
import { Flow, printPhase } from '../flow.js';
import { DOUBLE_ACTION, doubleFeedStage } from '../doublefeed.js';
import { scene, mini, paperGuide, outputChoices, feedChoices, feedPlace, faceWord, voiceForMovement } from '../scenes.js';

/**
 * Guarda por dónde entra el papel. Si cambia (o si recién se sabe que es de arriba), el lado en que va
 * lo impreso vuelve al valor típico de ese tipo, salvo que haya una calibración que conservar.
 * Típico: cajón abajo → lo impreso hacia arriba; alimentador de arriba → lo impreso mirando hacia atrás
 * (esas impresoras imprimen la cara que mira hacia ti).
 */
export async function saveFeed(api, printer, feed, { keepCalibration = false } = {}) {
  const prof = await api.printerProfile(printer);
  const changed = prof.feed ? prof.feed !== feed : feed === 'top';
  const patch = { feed };
  if (changed && !(keepCalibration && prof.calibrated)) patch.faceUp = feed !== 'top';
  return api.updatePrinter(printer, patch);
}

/** Pregunta por dónde se pone el papel (con dibujos) y lo guarda en el perfil. */
export async function askFeed(flow, api, printer, opts = {}) {
  const prof = await api.printerProfile(printer);
  let picked;
  const ctl = flow.stage({
    chip: 'act',
    voice: 'tipo-pregunta',
    title: '¿Por dónde pones el papel en tu impresora?',
    lead: 'Elige la que se parece a la tuya. Así las instrucciones te muestran dónde poner el mazo.',
    body: feedChoices((k) => { picked = k; ctl.resolve(k); }, prof.feed),
  });
  await ctl.wait();
  return saveFeed(api, printer, picked, opts);
}

/**
 * Pregunta qué hoja de prueba quedó arriba del montón. Si es la HOJA 1, el sistema (o el driver)
 * imprime cada trabajo de la última página a la primera: pasa en algunos drivers de Windows y no en CUPS.
 * Con esto el mazo termina ordenado, con la página 1 arriba, en cualquier impresora y sistema.
 */
export async function askStackTop(flow, api, printer, outputFace) {
  const down = outputFace === 'down';
  let picked;
  const opts = [
    { key: 'last', title: 'HOJA 2 · FRENTE', text: 'la segunda hoja quedó encima.', n: 2 },
    { key: 'first', title: 'HOJA 1 · FRENTE', text: 'la primera hoja quedó encima.', n: 1 },
  ];
  const ctl = flow.stage({
    chip: 'act',
    voice: 'apilado-pregunta',
    title: '¿Qué hoja quedó arriba del montón?',
    lead: down
      ? 'Levanta la hoja de arriba, dale vuelta y mira qué dice. Después déjala como estaba.'
      : 'Mira la hoja de arriba, sin moverla. Con esto el mazo terminará ordenado, con la página 1 arriba.',
    body: h('div.choices.stack-choices', opts.map((o) =>
      h('button.choice', { onclick: () => { picked = o.key; ctl.resolve(o.key); } },
        h('span.mini-sheets', mini(o.n, { down: outputFace === 'up-out' })),
        h('span', h('b', o.title), h('span', o.text))))),
  });
  await ctl.wait();
  return api.updatePrinter(printer, { stackReversed: picked === 'first' });
}

/** Pregunta cómo salen las hojas de la impresora y lo guarda en el perfil. */
export async function askOutputFace(flow, api, printer) {
  let picked;
  const ctl = flow.stage({
    chip: 'act',
    voice: 'salida-pregunta',
    title: 'Mira las hojas que salieron, sin moverlas',
    lead: 'Fíjate en la hoja de arriba, tal como quedó en la salida. <b>¿Qué ves?</b> Con esto la animación te mostrará el movimiento exacto.',
    body: outputChoices((k) => { picked = k; ctl.resolve(k); }),
  });
  await ctl.wait();
  return api.updatePrinter(printer, { outputFace: picked });
}

export const ANSWERS = [
  { key: 'ok', title: 'Dice HOJA 1 · REVERSO', text: 'y las dos flechas apuntan al mismo borde del papel.', minis: [[1], [1]] },
  { key: 'swapped', title: 'Dice HOJA 2 · REVERSO', text: 'el reverso quedó en la otra hoja; las flechas coinciden.', minis: [[1], [2]] },
  { key: 'upside', title: 'Dice HOJA 1, pero de cabeza', text: 'la flecha de atrás apunta al borde contrario.', minis: [[1], [1, true]] },
  { key: 'both', title: 'Dice HOJA 2 y de cabeza', text: 'otra hoja y la flecha al revés.', minis: [[1], [2, true]] },
  { key: 'same-side', title: 'Atrás no hay nada', text: 'el reverso se imprimió encima del frente (las dos caras en el mismo lado).', minis: [[1, false, true]] },
  { key: 'double', title: 'Se fueron 2 hojas juntas', text: 'o salió una hoja de más, en blanco o con algo que no corresponde.', minis: [[1], ['+']] },
];

export function answerChoices(onPick) {
  return h('div.choices', ANSWERS.map((a) =>
    h('button.choice', { class: a.wide ? 'wide' : '', onclick: () => onPick(a.key) },
      h('span.mini-sheets', a.minis.map(([n, down, over], i) => mini(n, { down, front: i === 0 && a.minis.length > 1, over }))),
      h('span', h('b', a.title), h('span', a.text)))));
}

export async function runCalibration(root, app) {
  const { api } = app;
  const printer = app.S.printer;
  let profile = await api.printerProfile(printer);
  const doc = { name: 'Calibrar impresora', kind: 'printer', sub: printer };
  const steps = [
    { id: 'feed', label: 'Tipo de impresora' },
    { id: 'intro', label: 'Cómo funciona' },
    { id: 'paper', label: 'Poner 2 hojas' },
    { id: 'fronts', label: 'Imprimir frentes de prueba' },
    { id: 'flip', label: 'Dar vuelta las hojas' },
    { id: 'backs', label: 'Imprimir reversos de prueba' },
    { id: 'look', label: 'Contar qué salió' },
    { id: 'end', label: 'Listo' },
  ];
  const flow = new Flow(root, {
    doc, steps,
    // Se puede salir en cualquier paso; lo ya medido (tipo de impresora, salida) queda guardado.
    exit: { label: 'Salir de la calibración', onExit: () => app.go(app.S.returnTo || 'home', { keepSelection: true }) },
  });

  // Desde «Imprimir sin calibrar…»: primero la advertencia; si elige calibrar, sigue la calibración.
  if (app.S.calSkipFirst) {
    app.S.calSkipFirst = false;
    flow.mark('intro');
    if ((await riskStage(flow)) === 'skip') {
      await api.updatePrinter(printer, { riskAccepted: true });
      return app.go(app.S.returnTo || 'home', { keepSelection: true });
    }
  }
  // Lo primero: qué tipo de impresora es (de esto dependen los textos y los dibujos)
  flow.mark('feed');
  profile = await askFeed(flow, api, printer);
  flow.mark('intro');
  let ctl = flow.stage({
    chip: 'act',
    voice: 'cal-intro',
    title: 'Enseñémosle a la app cómo mueve el papel tu impresora',
    lead: 'Cada impresora entrega las hojas de una forma distinta. Con <b>2 hojas de prueba</b> la app aprende en qué orden y hacia dónde debe imprimir los reversos. Se hace una sola vez por impresora.',
    scene: scene('flip', { faceUp: profile.faceUp, feed: profile.feed }),
    actions: [
      { key: 'go', label: 'Empezar la prueba', primary: true, icon: 'sparkles' },
      { key: 'skip', label: 'Saltar la calibración', ghost: true },
    ],
  });
  if ((await ctl.wait()) === 'skip') {
    if ((await riskStage(flow)) === 'skip') {
      await api.updatePrinter(printer, { riskAccepted: true });
      return app.go(app.S.returnTo || 'home', { keepSelection: true });
    }
  }

  const cal = await api.calibration();
  let askedOut = false;
  for (;;) {
    flow.mark('paper');
    ctl = flow.stage({
      chip: 'act',
      voice: 'cal-papel',
      title: `Pon 2 hojas en ${feedPlace(profile)}`,
      lead: 'Hojas en blanco, del tamaño que usas siempre. Cuando estén puestas, aprieta <b>Imprimir frentes</b>.',
      scene: scene('load', { text: '2 hojas', feed: profile.feed }),
      actions: [{ key: 'go', label: 'Imprimir frentes', primary: true, icon: 'printer' }],
    });
    await ctl.wait();

    flow.mark('fronts');
    ctl = flow.stage({ chip: 'wait', voice: 'cal-frentes', title: 'Imprimiendo los frentes de prueba', lead: 'Saldrán dos hojas con una flecha y las palabras <b>HOJA 1 · FRENTE</b> y <b>HOJA 2 · FRENTE</b>.', scene: scene('print', { outputFace: profile.outputFace }), progress: true });
    try {
      await printPhase(api, ctl, { file: cal.fronts, printer, sheets: 2, secPerSheet: profile.secPerSheet, label: 'Frentes de prueba' });
    } catch (e) {
      toast(e.message, 'warn');
      return app.go('printer');
    }

    flow.mark('flip');
    if (!askedOut) {
      profile = await askOutputFace(flow, api, printer);
      profile = await askStackTop(flow, api, printer, profile.outputFace);
      askedOut = true;
    }
    ctl = flow.stage({
      chip: 'act',
      voice: voiceForMovement(profile),
      title: `Toma las 2 hojas y vuelve a ponerlas en ${feedPlace(profile)}`,
      lead: 'Sigue los 3 pasos de la animación. Antes de ponerlas, airéalas un poco y deja que se seque la tinta: así la impresora no toma 2 juntas.',
      scene: paperGuide(profile, { sheets: 2 }),
      actions: [{ key: 'go', label: 'Ya las puse · imprimir reversos', primary: true, icon: 'printer' }],
    });
    await ctl.wait();

    flow.mark('backs');
    ctl = flow.stage({ chip: 'wait', voice: 'cal-reversos', title: 'Imprimiendo los reversos de prueba', lead: 'Ahora atrás se imprime <b>HOJA 1 · REVERSO</b> y <b>HOJA 2 · REVERSO</b>.', scene: scene('print', { outputFace: profile.outputFace }), progress: true });
    const dbl = { ...DOUBLE_ACTION };
    let res;
    try {
      res = await printPhase(api, ctl, { file: cal.backs, printer, sheets: 2, secPerSheet: profile.secPerSheet, label: 'Reversos de prueba', extra: [dbl] });
    } catch (e) {
      toast(e.message, 'warn');
      return app.go('printer');
    }
    if (res === 'aborted') return;
    // Hoja doble: el resultado no sirve; se repite la prueba sin guardar nada
    if (res === 'double') { await doubleFeedStage(flow, app, { context: 'cal', cancelled: !!dbl.cancelled }); continue; }

    flow.mark('look');
    let picked;
    ctl = flow.stage({
      chip: 'act',
      voice: 'cal-pregunta',
      title: 'Toma la hoja que dice HOJA 1 · FRENTE y dale vuelta',
      lead: '¿Qué ves atrás? Elige la opción que coincide.',
      body: answerChoices((k) => { picked = k; ctl.resolve(k); }),
    });
    await ctl.wait();

    if (picked === 'double') { await doubleFeedStage(flow, app, { context: 'cal', finished: true }); continue; }
    if (picked === 'same-side') {
      profile = await api.updatePrinter(printer, { faceUp: !profile.faceUp });
      const again = flow.stage({
        chip: 'act',
        chipText: 'OTRA VEZ',
        voice: 'cal-otra-vez',
        title: 'Entendido: tu impresora imprime por el otro lado',
        lead: `Repitamos la prueba con 2 hojas nuevas. Esta vez pondrás el mazo con la <b>cara impresa ${faceWord(profile)}</b>.`,
        scene: paperGuide(profile, { sheets: 2 }),
        actions: [{ key: 'go', label: 'Repetir la prueba', primary: true, icon: 'refresh' }],
      });
      await again.wait();
      continue;
    }
    const map = { ok: [false, false], swapped: [true, false], upside: [false, true], both: [true, true] }[picked];
    // Los reversos de prueba salen sin invertir: map[0] dice si hacía falta invertirlos con el movimiento
    // que se hizo. Si eso contradice lo esperado para ese movimiento, se guarda como corrección.
    const known = await api.printerProfile(printer);
    const invertFix = known.outputFace ? map[0] !== known.keepsOrder : false;
    profile = await api.updatePrinter(printer, { calibrated: true, riskAccepted: false, invert: map[0], invertFix, rotate: map[1] });
    break;
  }

  flow.mark('__end');
  ctl = flow.stage({
    chip: 'done',
    voice: 'cal-lista',
    title: 'Impresora calibrada',
    lead: `Desde ahora los reversos salen en el orden correcto${profile.rotate ? ' y girados para que queden derechos' : ''}. Si cambias de impresora o de lugar del papel, puedes volver a calibrar en <b>Impresora</b>.`,
    scene: scene('done', { stamp: 'CALIBRADA' }),
    actions: [{ key: 'ok', label: app.S.returnTo === 'home' ? 'Volver a imprimir' : 'Listo', primary: true, icon: 'check' }],
  });
  await ctl.wait();
  app.go(app.S.returnTo || 'home', { keepSelection: true });
}

/** Advertencia antes de saltar la calibración: hay que marcar la casilla para aceptar el riesgo. */
export function riskPanel(onChange) {
  const box = h('input', { type: 'checkbox', id: 'risk-ok' });
  box.addEventListener('change', () => onChange(box.checked));
  return h('div.risk',
    h('div.note.warn', icon('alert'), h('div',
      h('strong', 'Sin calibrar puedes perder hojas'),
      h('p', 'La app no sabrá en qué orden ni hacia dónde poner los reversos: pueden salir detrás de otra página o de cabeza. Calibrar usa solo 2 hojas y toma un minuto.'))),
    h('label.check-row', { for: 'risk-ok' }, box, h('span', 'Entiendo el riesgo y quiero imprimir sin calibrar esta impresora.')));
}

export async function riskStage(flow) {
  let skipBtn;
  const ctl = flow.stage({
    chip: 'act',
    chipText: 'ATENCIÓN',
    voice: 'cal-riesgo',
    title: '¿Seguro que quieres saltar la calibración?',
    lead: 'Te recomendamos calibrar: es la única forma de saber cómo tu impresora toma el papel.',
    body: riskPanel((ok) => { if (skipBtn) skipBtn.disabled = !ok; }),
    actions: [
      { key: 'calibrate', label: 'Calibrar ahora', primary: true, icon: 'sparkles' },
      { key: 'skip', label: 'Saltar y asumir el riesgo', icon: 'alert' },
    ],
  });
  skipBtn = [...ctl.actionsEl.querySelectorAll('button')].find((b) => b.textContent.includes('asumir'));
  const box = ctl.actionsEl.parentElement.querySelector('#risk-ok');
  const sync = () => { skipBtn.disabled = !box.checked; };
  box.addEventListener('change', sync);
  box.addEventListener('input', sync);
  sync();
  return ctl.wait();
}