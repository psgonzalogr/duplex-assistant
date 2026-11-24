// Armazón común de los asistentes: lista de pasos + escenario con «Ahora…», animación y progreso.
import { h, icon, clear, badge } from './ui.js';
import { say, play } from './audio.js';

const CHIP_SOUND = { act: 'aviso', wait: 'paso', done: 'logro' };

const CHIP = {
  act: { cls: 'act', text: 'TE TOCA', ic: 'hand' },
  wait: { cls: 'wait', text: 'ESPERA', ic: 'hourglass' },
  done: { cls: 'done', text: 'LISTO', ic: 'check' },
};

export class Flow {
  /**
   * doc: { name, kind, sub }
   * steps: [{ id, label, group? }]
   */
  constructor(root, { doc, steps, sideNote }) {
    this.steps = steps;
    this.stepEls = new Map();
    this.totalFill = h('div.fill');
    this.totalText = h('span');
    const list = h('ol.steps');
    let group = null;
    steps.forEach((s, i) => {
      if (s.group && s.group !== group) {
        group = s.group;
        list.append(h('li.batch', group));
      }
      const el = h('li.step', h('span.n', String(i + 1)), h('span.lbl', s.label));
      this.stepEls.set(s.id, el);
      list.append(el);
    });
    this.main = h('div.stage');
    this.el = h('div.flow.view',
      h('aside.flow-side',
        h('div.flow-doc', doc.kind === 'printer' ? h('span.badge.printer', icon('printer')) : badge(doc.kind), h('div.t', h('b', doc.name), h('span', doc.sub))),
        list,
        sideNote || null,
        h('div.bar-total.progress',
          h('div.progress-meta', h('span', 'Avance total'), this.totalText),
          h('div.track.thin', this.totalFill))),
      h('section.flow-main', this.main));
    clear(root, this.el);
  }

  mark(id) {
    const idx = this.steps.findIndex((s) => s.id === id);
    this.steps.forEach((s, i) => {
      const el = this.stepEls.get(s.id);
      el.classList.toggle('done', i < idx || id === '__end');
      el.classList.toggle('now', i === idx);
      el.querySelector('.n').replaceChildren(i < idx || id === '__end' ? icon('check', 'sm') : String(i + 1));
      if (i === idx) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    });
    const frac = id === '__end' ? 1 : Math.max(0, idx) / this.steps.length;
    this.totalFill.style.width = `${Math.round(frac * 100)}%`;
    this.totalFill.classList.toggle('done', id === '__end');
    this.totalText.textContent = `${Math.round(frac * 100)} %`;
  }

  /**
   * Muestra un paso. Devuelve controles: setProgress, wait (promesa del botón elegido), setNote.
   * cfg: { chip:'act'|'wait'|'done', title, lead, scene, progress, actions:[{key,label,primary,icon,big}], note,
   *        voice: id de la frase grabada, sound: nombre del sonido (false = ninguno) }
   */
  stage(cfg) {
    const chip = CHIP[cfg.chip || 'act'];
    if (cfg.sound !== false) play(cfg.sound || CHIP_SOUND[cfg.chip || 'act']);
    say(cfg.voice);
    const actionsEl = h('div.stage-actions');
    let resolveAction;
    const waiting = new Promise((r) => { resolveAction = r; });
    for (const a of cfg.actions || []) {
      const b = h('button.btn', {
        class: [a.primary && 'primary', a.big !== false && a.primary && 'big', a.ghost && 'ghost'].filter(Boolean).join(' '),
        onclick: () => { if (a.primary) play('paso'); actionsEl.querySelectorAll('button').forEach((x) => (x.disabled = true)); resolveAction(a.key); },
      }, a.icon ? icon(a.icon) : null, a.label);
      actionsEl.append(b);
    }
    let fill, metaL, metaR;
    const progress = cfg.progress
      ? h('div.progress', h('div.track', (fill = h('div.fill'))), h('div.progress-meta', (metaL = h('span')), (metaR = h('span'))))
      : null;
    const noteSlot = h('div');
    if (cfg.note) noteSlot.append(cfg.note);
    const lead = typeof cfg.lead === 'string' ? h('p.lead', { html: cfg.lead }) : cfg.lead ? h('div.lead', cfg.lead) : null;

    clear(this.main,
      h('span.now-chip', { class: chip.cls, role: 'status' }, cfg.chip === 'wait' ? h('span.pulse') : icon(chip.ic, 'sm'), cfg.chipText || chip.text),
      h('h1', cfg.title),
      lead,
      cfg.scene || null,
      progress,
      noteSlot,
      cfg.body || null,
      actionsEl.childElementCount ? actionsEl : null);
    this.main.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.23,1,0.32,1)' });
    const firstPrimary = actionsEl.querySelector('.primary');
    if (firstPrimary) setTimeout(() => firstPrimary.focus({ preventScroll: true }), 60);

    return {
      wait: () => waiting,
      resolve: (key) => resolveAction(key),
      setProgress: (frac, left = '', right = '', done = false) => {
        if (!fill) return;
        fill.style.width = `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%`;
        fill.classList.toggle('done', done);
        metaL.innerHTML = left;
        metaR.innerHTML = right;
      },
      setNote: (node) => clear(noteSlot, node),
      addAction: (a) => {
        const b = h('button.btn', { class: a.ghost ? 'ghost' : '', onclick: () => resolveAction(a.key) }, a.icon ? icon(a.icon) : null, a.label);
        actionsEl.append(b);
        if (!actionsEl.isConnected) this.main.append(actionsEl);
        return b;
      },
      actionsEl,
    };
  }
}

/**
 * Envía un PDF y acompaña con avance estimado consultando la cola de impresión.
 * Devuelve 'done' | 'skipped'. Lanza error si no se pudo enviar.
 */
export async function printPhase(api, ctl, { file, printer, sheets, secPerSheet, label }) {
  const name = file.split(/[\\/]/).pop();
  ctl.setProgress(0.02, 'Enviando a la impresora…', '');
  await api.print({ file, printer });
  const warm = 8;
  const est = warm + sheets * secPerSheet;
  const t0 = performance.now();
  let seen = false;
  let skipped = false;
  let warned = false;
  const skipBtn = ctl.addAction({ key: 'skip', label: 'Ya salieron todas', icon: 'check', ghost: true });
  const skipP = ctl.wait().then((k) => { if (k === 'skip') skipped = true; });

  while (!skipped) {
    const elapsed = (performance.now() - t0) / 1000;
    let q = [];
    try { q = await api.queue(printer); } catch { /* sin datos de cola */ }
    const mine = q.filter((j) => !j.name || j.name.includes(name) || name.includes(j.name));
    const inQueue = mine.length > 0 || (q.length > 0 && !seen && elapsed < 6);
    if (inQueue) seen = true;
    const counted = mine.find((j) => j.total > 0);
    let frac = counted ? counted.printed / counted.total : Math.min(0.96, elapsed / est);
    const doneSheets = Math.min(sheets, Math.floor(frac * sheets));
    const left = Math.max(0, est - elapsed);
    ctl.setProgress(frac,
      `${label} · hoja <b>${Math.max(1, Math.min(sheets, doneSheets + 1))}</b> de ${sheets} <span style="opacity:.7">(estimado)</span>`,
      left > 2 ? `faltan ~${fmt(left)}` : 'terminando…');
    if (!warned && elapsed > est * 1.7 + 20 && inQueue) {
      warned = true;
      play('aviso');
      say('run-lento');
      ctl.setNote(h('div.note.warn', icon('alert'), h('div', h('strong', 'Está tardando más de lo normal'),
        h('p', 'Revisa que la impresora esté encendida, tenga papel y no muestre un error. Cuando todas las hojas hayan salido, aprieta «Ya salieron todas».'))));
    }
    const finished = (seen && !inQueue && elapsed >= est * 0.85) || (!seen && elapsed >= est) || (counted && counted.printed >= counted.total);
    if (finished) break;
    await Promise.race([sleep(1500), skipP]);
  }
  skipBtn.remove();
  const elapsed = (performance.now() - t0) / 1000;
  ctl.setProgress(1, `${label} · <b>${sheets}</b> de ${sheets}`, 'listo', true);
  play('exito');
  if (!skipped && seen) api.learnSpeed?.(printer, sheets, elapsed - warm);
  await sleep(500);
  return skipped ? 'skipped' : 'done';
}

function fmt(sec) {
  if (sec < 55) return `${Math.max(5, Math.round(sec / 5) * 5)} s`;
  return `${Math.round(sec / 60)} min`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
