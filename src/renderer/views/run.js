// Asistente de impresión: papel → frentes → dar vuelta → reversos (por lote) → listo.
import { h, icon, plural, toast } from '../ui.js';
import { Flow, printPhase } from '../flow.js';
import { scene, paperGuide, voiceForMovement, feedPlace, isTop } from '../scenes.js';
import { askOutputFace, askFeed } from './calibrate.js';

export async function runPrint(root, app, job) {
  const { api } = app;
  const printer = app.S.printer;
  let profile = await api.printerProfile(printer);
  let plan;
  const doc = { name: job.file.name, kind: job.file.kind, sub: `${plural(job.copies, 'copia', 'copias')} · ${printer}` };

  // Paso previo mientras se arman los PDF
  const prep = new Flow(root, { doc, steps: [{ id: 'prep', label: 'Preparando las hojas' }] });
  prep.mark('prep');
  prep.stage({ chip: 'wait', voice: 'run-preparando', title: 'Ordenando las páginas…', lead: 'Estoy armando el orden exacto de los frentes y los reversos de todas las copias.', scene: scene('print', { text: 'Ordenando…', outputFace: profile.outputFace }) });
  try {
    plan = await api.planJob({ pdfPath: job.pdfPath, copies: job.copies, range: job.range, printer });
  } catch (e) {
    toast(e.message, 'warn');
    app.go('home');
    return;
  }

  const multi = plan.batches.length > 1;
  // Textos de cada pasada. Con impresoras que dejan las hojas boca arriba van primero las caras de
  // atrás: así la última cara impresa (la que queda a la vista) es la de adelante y el mazo termina
  // ordenado con la primera página arriba.
  const BF = !!plan.backsFirst;
  const T = BF
    ? {
      step1: 'Imprimir caras de atrás', step2: 'Imprimir caras de adelante',
      go1: 'Imprimir caras de atrás', go2: 'Ya las puse · imprimir caras de adelante', redo: 'Se atascó: repetir las caras de atrás',
      title1: 'Imprimiendo las caras de atrás',
      lead1: 'Van primero las caras de atrás: así, al terminar, el mazo queda ordenado y con la primera página arriba. No toques las hojas mientras salen.',
      title2: 'Imprimiendo las caras de adelante',
      lead2: 'Ya casi. Al terminar, el mazo queda ordenado con la primera página arriba: solo tienes que separar las copias.',
      label1: 'Caras de atrás', label2: 'Caras de adelante',
      voicePaper: 'run-papel-atras', voice1: 'run-atras', voice2: 'run-adelante',
    }
    : {
      step1: 'Imprimir caras de adelante', step2: 'Imprimir reversos',
      go1: 'Imprimir caras de adelante', go2: 'Ya las puse · imprimir reversos', redo: 'Se atascó: repetir los frentes',
      title1: 'Imprimiendo las caras de adelante',
      lead1: 'No toques las hojas mientras salen. Te aviso cuando haya que darlas vuelta.',
      title2: 'Imprimiendo los reversos',
      lead2: 'Ya casi. Las hojas salen terminadas y en orden.',
      label1: 'Frentes', label2: 'Reversos',
      voicePaper: 'run-papel', voice1: 'run-frentes', voice2: 'run-reversos',
    };
  const fileOf = (b, face) => (face === 'backs' ? b.backs : b.fronts);

  const steps = [];
  for (const b of plan.batches) {
    const group = multi ? `Lote ${b.index} de ${plan.batches.length} · ${plural(b.sheets, 'hoja', 'hojas')}` : null;
    steps.push({ id: `paper${b.index}`, label: b.index === 1 ? 'Poner papel' : 'Poner papel nuevo', group });
    steps.push({ id: `pass1-${b.index}`, label: b.passes.length > 1 ? T.step1 : 'Imprimir', group });
    if (b.passes.length > 1) {
      steps.push({ id: `flip${b.index}`, label: 'Dar vuelta el mazo', group });
      steps.push({ id: `pass2-${b.index}`, label: T.step2, group });
    }
  }
  steps.push({ id: 'end', label: 'Listo' });

  const sideNote = plan.blanksPerCopy
    ? h('div.note.info', icon('info'), h('p', 'El documento tiene páginas impares: cada copia lleva una cara en blanco al final para que no se descuadren.'))
    : null;
  const flow = new Flow(root, { doc, steps, sideNote });

  // Se pregunta una sola vez por impresora: de esto dependen los textos y los dibujos.
  if (!profile.feed) {
    flow.mark(`paper${plan.batches[0].index}`);
    profile = await askFeed(flow, api, printer, { keepCalibration: true });
  }

  for (const b of plan.batches) {
    const two = b.passes.length > 1;
    // 1. Papel
    flow.mark(`paper${b.index}`);
    const first = b.index === 1;
    const go1 = two ? T.go1 : 'Imprimir';
    let ctl = flow.stage({
      chip: 'act',
      voice: first ? (two ? T.voicePaper : 'run-papel') : 'run-lote',
      title: first ? `Pon al menos ${plural(b.sheets, 'hoja', 'hojas')} en ${feedPlace(profile)}` : `Lote ${b.index}: saca las hojas terminadas y pon ${plural(b.sheets, 'hoja nueva', 'hojas nuevas')}`,
      lead: multi
        ? `${isTop(profile) ? 'Tu alimentador' : 'Tu bandeja'} admite unas ${profile.capacity} hojas, así que el trabajo va en <b>${plan.batches.length} lotes</b>. Este lote lleva las copias ${b.firstCopy}${b.lastCopy !== b.firstCopy ? `–${b.lastCopy}` : ''}.`
        : `Se usarán <b>${plural(b.sheets, 'hoja', 'hojas')}</b> en total. Cuando el papel esté listo, aprieta <b>${go1}</b>.`,
      scene: scene('load', { text: `${b.sheets} hojas`, feed: profile.feed }),
      actions: [
        { key: 'go', label: go1, primary: true, icon: 'printer' },
        { key: 'cancel', label: 'Cancelar', ghost: true },
      ],
    });
    if ((await ctl.wait()) === 'cancel') return app.go('home');

    // 2. Primera pasada
    let again = true;
    while (again) {
      again = false;
      flow.mark(`pass1-${b.index}`);
      ctl = flow.stage({
        chip: 'wait',
        voice: two ? T.voice1 : 'run-frentes',
        title: two ? T.title1 : 'Imprimiendo',
        lead: two ? T.lead1 : 'No toques las hojas mientras salen.',
        scene: scene('print', { outputFace: profile.outputFace }),
        progress: true,
      });
      // Con las caras de atrás primero, las hojas sin reverso salen en blanco en esta pasada
      if (two && BF && b.blankBacks) ctl.setNote(blankBacksNote(b.blankBacks, plan.lastPage, 'first'));
      const ok = await safePhase(flow, () => printPhase(api, ctl, { file: fileOf(b, b.passes[0]), printer, sheets: b.sheets, secPerSheet: plan.secPerSheet, label: two ? T.label1 : 'Hojas' }));
      if (!ok) return app.go('home');
      profile = await api.printerProfile(printer);
      plan.secPerSheet = profile.secPerSheet;

      if (!two) break;
      // 3. Dar vuelta
      flow.mark(`flip${b.index}`);
      if (!profile.outputFace) profile = await askOutputFace(flow, api, printer);
      ctl = flow.stage({
        chip: 'act',
        voice: voiceForMovement(profile),
        title: `Toma las ${b.sheets} hojas y ponlas de nuevo en ${feedPlace(profile)}`,
        lead: 'Sigue los 3 pasos de la animación, sin cambiar el orden de las hojas.',
        scene: paperGuide(profile, { sheets: b.sheets }),
        note: b.blankBacks ? blankBacksNote(b.blankBacks, plan.lastPage, BF ? 'flip-bf' : 'flip') : undefined,
        actions: [
          { key: 'go', label: T.go2, primary: true, icon: 'printer' },
          { key: 'redo', label: T.redo, icon: 'refresh', ghost: true },
        ],
      });
      const k = await ctl.wait();
      if (k === 'redo') { again = true; continue; }

      // 4. Segunda pasada
      flow.mark(`pass2-${b.index}`);
      ctl = flow.stage({
        chip: 'wait',
        voice: T.voice2,
        title: T.title2,
        lead: T.lead2,
        scene: scene('print', { outputFace: profile.outputFace }),
        progress: true,
      });
      if (!BF && b.blankBacks) ctl.setNote(blankBacksNote(b.blankBacks, plan.lastPage, 'second'));
      const ok2 = await safePhase(flow, () => printPhase(api, ctl, { file: fileOf(b, b.passes[1]), printer, sheets: b.sheets, secPerSheet: plan.secPerSheet, label: T.label2 }));
      if (!ok2) return app.go('home');
    }
  }

  flow.mark('__end');
  const end = flow.stage({
    chip: 'done',
    voice: 'run-listo',
    title: `¡Listo! ${plural(plan.copies, 'copia impresa', 'copias impresas')} a doble cara`,
    lead: `${BF ? 'El mazo quedó ordenado, con la primera página arriba: solo separa las copias. ' : ''}Usaste <b>${plural(plan.totalSheets, 'hoja', 'hojas')}</b> en vez de ${plan.totalSheets * 2 - plan.blanksPerCopy * plan.copies}. Si una hoja salió con el reverso girado o en otro orden, vuelve a calibrar la impresora en <b>Impresora</b>.`,
    scene: scene('done'),
    actions: [
      { key: 'home', label: 'Imprimir otro documento', primary: true, icon: 'fileText' },
      { key: 'again', label: 'Imprimir más copias de este', icon: 'refresh' },
    ],
  });
  const k = await end.wait();
  app.go('home', { keepSelection: k === 'again' });
}

async function safePhase(flow, fn) {
  for (;;) {
    try {
      await fn();
      return true;
    } catch (e) {
      const ctl = flow.stage({
        chip: 'act',
        chipText: 'ATENCIÓN',
        voice: 'run-error',
        sound: 'error',
        title: 'No se pudo enviar a la impresora',
        lead: e.message,
        note: h('div.note.warn', icon('alert'), h('p', 'Revisa que la impresora esté encendida y conectada. Ninguna hoja se imprimió en este paso.')),
        actions: [
          { key: 'retry', label: 'Reintentar', primary: true, icon: 'refresh' },
          { key: 'cancel', label: 'Cancelar impresión', ghost: true },
        ],
      });
      if ((await ctl.wait()) === 'cancel') return false;
    }
  }
}

/**
 * Aviso para documentos impares: la hoja de la última página no tiene reverso, pero igual pasa por la
 * impresora en las dos pasadas (sacarla descuadraría las copias). Sin aviso parece una falla.
 * when: 'flip' | 'second' (reversos después) · 'first' | 'flip-bf' (caras de atrás primero)
 */
function blankBacksNote(count, lastPage, when) {
  const one = count === 1;
  const cuales = one ? `La hoja de la <b>página ${lastPage}</b>` : `Las ${count} hojas de la <b>página ${lastPage}</b> (una por copia)`;
  const low = cuales.charAt(0).toLowerCase() + cuales.slice(1);
  const text = {
    flip: `${cuales} no ${one ? 'tiene' : 'tienen'} reverso: ${one ? 'pasará' : 'pasarán'} por la impresora y ${one ? 'saldrá' : 'saldrán'} sin nada atrás. Déja${one ? 'la' : 'las'} en el mazo igual, así las copias no se desordenan.`,
    second: `Es normal: ${low} ${one ? 'sale' : 'salen'} sin imprimir atrás porque el documento tiene páginas impares.`,
    first: `Es normal que ${one ? 'una hoja salga' : `${count} hojas salgan`} en blanco: ${one ? 'es la' : 'son las'} de la <b>página ${lastPage}</b>, que no tiene reverso. La página ${lastPage} se imprime en la próxima pasada.`,
    'flip-bf': `En el mazo ${one ? 'hay una hoja' : `hay ${count} hojas`} en blanco: ${one ? 'es la' : 'son las'} de la <b>página ${lastPage}</b>, que no tiene reverso. Déja${one ? 'la' : 'las'} en su lugar: en la próxima pasada se imprime la página ${lastPage}.`,
  }[when];
  return h('div.note.info', icon('info'), h('p', { html: text }));
}
