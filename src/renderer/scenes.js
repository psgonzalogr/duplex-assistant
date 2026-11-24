// Ilustraciones animadas (impresora vista desde arriba) para guiar cada paso.
import { h, icon } from './ui.js';

const ARROW = '<svg viewBox="0 0 34 60" fill="currentColor"><path d="M17 0 34 22H23v38H11V22H0z"/></svg>';

export function paper({ printed = true, cls = '' } = {}) {
  return h('div.paper', { class: cls },
    printed
      ? h('div.face-print', h('span.arrow', { html: ARROW }), h('div.lines', h('i'), h('i'), h('i'), h('i')))
      : h('div.face-print', { style: { display: 'block' } }),
    h('div.face-blank'));
}

function printerBody() {
  return [
    h('div.printer', h('div.tanks', ['#22d3ee', '#ec4899', '#facc15', '#0f172a'].map((c) => h('i', { style: { background: c } }))), h('div.led')),
    h('div.slot'),
  ];
}

function tray(label = 'Bandeja de papel') {
  return h('div.tray', h('span.tray-label', label));
}

function tag(text, { cls = '', ic, style } = {}) {
  return h('span.scene-tag', { class: cls, style }, ic ? icon(ic, 'sm') : null, text);
}

/**
 * mode: 'load' | 'print' | 'flip' | 'done'
 * opts.faceUp: el mazo va con la cara impresa hacia arriba
 */
export function scene(mode, opts = {}) {
  const root = h('div.scene', { class: mode, role: 'img', 'aria-label': opts.label || '' });
  root.append(...printerBody());

  if (mode === 'load') {
    root.append(tray(), paper({ printed: false }), paper({ printed: false }), paper({ printed: false }));
    root.append(tag(opts.text || 'Pon papel en la bandeja', { ic: 'arrowUp', style: { left: 'calc(50% + 150px)', bottom: '90px' } }));
  }

  if (mode === 'print') {
    root.append(tray('Salida de papel'), paper({ cls: 'out' }));
    root.append(tag(opts.text || 'Imprimiendo…', { cls: 'amber', ic: 'hourglass', style: { left: 'calc(50% + 190px)', top: '60px' } }));
  }

  if (mode === 'flip') {
    const faceUp = opts.faceUp !== false;
    root.append(
      tray(),
      h('div.out-spot', { style: { left: 'calc(50% + 210px)', bottom: '76px', right: 'auto' } }),
      tag('Hojas ya impresas', { style: { left: 'calc(50% + 222px)', bottom: '186px' } }),
    );
    const mover = paper({ cls: 'mover' });
    mover.style.setProperty('--flip', faceUp ? '0deg' : '180deg');
    mover.style.setProperty('--dx', '285px');
    root.append(mover);
    root.append(
      tag(faceUp ? 'Cara impresa hacia ARRIBA' : 'Cara impresa hacia ABAJO', { cls: 'red', ic: faceUp ? 'arrowUp' : 'flip', style: { left: 'calc(50% - 330px)', bottom: '96px' } }),
      tag('Borde de arriba hacia ADENTRO', { cls: 'red', ic: 'arrowUp', style: { left: 'calc(50% - 330px)', bottom: '52px' } }),
    );
  }

  if (mode === 'done') {
    root.append(tray('Listo'), paper(), paper());
    root.append(h('span.stamp.in-scene', opts.stamp || 'IMPRESO'));
  }
  return root;
}

/** Miniaturas de hoja para las opciones de calibración. */
export function mini(num, { down = false, front = false, over = false } = {}) {
  return h('span.mini', { class: [down && 'down', front && 'front', over && 'over'].filter(Boolean).join(' ') },
    h('span.ar', { html: '<svg viewBox="0 0 10 10" fill="currentColor"><path d="M5 0 10 7H0z"/></svg>' }),
    h('b', String(num)));
}
