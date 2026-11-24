// Asistente de impresión: papel → frentes → dar vuelta → reversos (por lote) → listo.
import { h, icon, plural, toast } from '../ui.js';
import { Flow, printPhase } from '../flow.js';
import { scene } from '../scenes.js';

export async function runPrint(root, app, job) {
  const { api } = app;
  const printer = app.S.printer;
  let profile = await api.printerProfile(printer);
  let plan;
  const doc = { name: job.file.name, kind: job.file.kind, sub: `${plural(job.copies, 'copia', 'copias')} · ${printer}` };

  // Paso previo mientras se arman los PDF
  const prep = new Flow(root, { doc, steps: [{ id: 'prep', label: 'Preparando las hojas' }] });
  prep.mark('prep');
  prep.stage({ chip: 'wait', title: 'Ordenando las páginas…', lead: 'Estoy armando el orden exacto de los frentes y los reversos de todas las copias.', scene: scene('print', { text: 'Ordenando…' }) });
  try {
    plan = await api.planJob({ pdfPath: job.pdfPath, copies: job.copies, range: job.range, printer });
  } catch (e) {
    toast(e.message, 'warn');
    app.go('home');
    return;
  }

  const multi = plan.batches.length > 1;
  const steps = [];
  for (const b of plan.batches) {
    const group = multi ? `Lote ${b.index} de ${plan.batches.length} · ${plural(b.sheets, 'hoja', 'hojas')}` : null;
    steps.push({ id: `paper${b.index}`, label: b.index === 1 ? 'Poner papel' : 'Poner papel nuevo', group });
    steps.push({ id: `fronts${b.index}`, label: 'Imprimir caras de adelante', group });
    if (b.backs) {
      steps.push({ id: `flip${b.index}`, label: 'Dar vuelta el mazo', group });
      steps.push({ id: `backs${b.index}`, label: 'Imprimir reversos', group });
    }
  }
  steps.push({ id: 'end', label: 'Listo' });

  const sideNote = plan.blanksPerCopy
    ? h('div.note.info', icon('info'), h('p', 'El documento tiene páginas impares: cada copia lleva una cara en blanco al final para que no se descuadren.'))
    : null;
  const flow = new Flow(root, { doc, steps, sideNote });

  for (const b of plan.batches) {
    // 1. Papel
    flow.mark(`paper${b.index}`);
    const first = b.index === 1;
    let ctl = flow.stage({
      chip: 'act',
      title: first ? `Pon al menos ${plural(b.sheets, 'hoja', 'hojas')} en la bandeja` : `Lote ${b.index}: saca las hojas terminadas y pon ${plural(b.sheets, 'hoja nueva', 'hojas nuevas')}`,
      lead: multi
        ? `Tu bandeja admite unas ${profile.capacity} hojas, así que el trabajo va en <b>${plan.batches.length} lotes</b>. Este lote lleva las copias ${b.firstCopy}${b.lastCopy !== b.firstCopy ? `–${b.lastCopy}` : ''}.`
        : `Se usarán <b>${plural(b.sheets, 'hoja', 'hojas')}</b> en total. Cuando el papel esté listo, aprieta <b>Imprimir caras de adelante</b>.`,
      scene: scene('load', { text: `${b.sheets} hojas` }),
      actions: [
        { key: 'go', label: 'Imprimir caras de adelante', primary: true, icon: 'printer' },
        { key: 'cancel', label: 'Cancelar', ghost: true },
      ],
    });
    if ((await ctl.wait()) === 'cancel') return app.go('home');

    // 2. Frentes
    let again = true;
    while (again) {
      again = false;
      flow.mark(`fronts${b.index}`);
      ctl = flow.stage({
        chip: 'wait',
        title: 'Imprimiendo las caras de adelante',
        lead: 'No toques las hojas mientras salen. Te aviso cuando haya que darlas vuelta.',
        scene: scene('print'),
        progress: true,
      });
      const ok = await safePhase(flow, () => printPhase(api, ctl, { file: b.fronts, printer, sheets: b.sheets, secPerSheet: plan.secPerSheet, label: 'Frentes' }));
      if (!ok) return app.go('home');
      profile = await api.printerProfile(printer);
      plan.secPerSheet = profile.secPerSheet;

      if (!b.backs) break;
      // 3. Dar vuelta
      flow.mark(`flip${b.index}`);
      ctl = flow.stage({
        chip: 'act',
        title: `Toma las ${b.sheets} hojas y ponlas de nuevo en la bandeja`,
        lead: `Sin cambiar el orden: deja la <b>cara impresa hacia ${profile.faceUp ? 'arriba' : 'abajo'}</b> y el <b>borde de arriba del texto hacia adentro</b> de la impresora, igual que en la animación.`,
        scene: scene('flip', { faceUp: profile.faceUp }),
        actions: [
          { key: 'go', label: 'Ya las puse · imprimir reversos', primary: true, icon: 'printer' },
          { key: 'redo', label: 'Se atascó: repetir los frentes', icon: 'refresh', ghost: true },
        ],
      });
      const k = await ctl.wait();
      if (k === 'redo') { again = true; continue; }

      // 4. Reversos
      flow.mark(`backs${b.index}`);
      ctl = flow.stage({
        chip: 'wait',
        title: 'Imprimiendo los reversos',
        lead: 'Ya casi. Las hojas salen terminadas y en orden.',
        scene: scene('print'),
        progress: true,
      });
      const ok2 = await safePhase(flow, () => printPhase(api, ctl, { file: b.backs, printer, sheets: b.sheets, secPerSheet: plan.secPerSheet, label: 'Reversos' }));
      if (!ok2) return app.go('home');
    }
  }

  flow.mark('__end');
  const end = flow.stage({
    chip: 'done',
    title: `¡Listo! ${plural(plan.copies, 'copia impresa', 'copias impresas')} a doble cara`,
    lead: `Usaste <b>${plural(plan.totalSheets, 'hoja', 'hojas')}</b> en vez de ${plan.totalSheets * 2 - plan.blanksPerCopy * plan.copies}. Si una hoja salió con el reverso girado o en otro orden, vuelve a calibrar la impresora en <b>Impresora</b>.`,
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
