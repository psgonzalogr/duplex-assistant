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

// ---------- Tipo de alimentación ----------
// 'bottom': cajón o bandeja abajo, hojas acostadas. 'top': alimentador atrás, arriba, hojas de pie.
// Para el orden da lo mismo: el alimentador es la bandeja «de pie» (la hoja de adelante = la de arriba).

export const isTop = (p) => p?.feed === 'top';

/** «la bandeja» o «el alimentador», para los textos. */
export function feedPlace(p) {
  return isTop(p) ? 'el alimentador' : 'la bandeja';
}

/** Hacia dónde va lo impreso al poner el mazo. */
export function faceWord(p, faceUp = p?.faceUp !== false) {
  if (isTop(p)) return faceUp ? 'mirando hacia ti' : 'mirando hacia atrás';
  return faceUp ? 'hacia arriba' : 'hacia abajo';
}

/** Alimentador de arriba visto desde arriba: queda detrás de la impresora. */
function feeder(label = 'Alimentador de arriba') {
  return h('div.feeder', h('span.tray-label', label));
}

function tag(text, { cls = '', ic, style } = {}) {
  return h('span.scene-tag', { class: cls, style }, ic ? icon(ic, 'sm') : null, text);
}

/**
 * mode: 'load' | 'print' | 'flip' | 'done'
 * opts.faceUp: el mazo va con la cara impresa hacia arriba
 */
export function scene(mode, opts = {}) {
  const top = opts.feed === 'top' && (mode === 'load' || mode === 'flip');
  const root = h('div.scene', { class: [mode, top && 'feed-top'].filter(Boolean).join(' '), role: 'img', 'aria-label': opts.label || '' });
  root.append(...printerBody());

  if (mode === 'load') {
    root.append(top ? feeder() : tray(), paper({ printed: false }), paper({ printed: false }), paper({ printed: false }));
    root.append(tag(opts.text || (top ? 'Pon papel en el alimentador' : 'Pon papel en la bandeja'), { ic: 'arrowUp', style: top ? { right: 'calc(50% + 140px)', top: '30px' } : { left: 'calc(50% + 150px)', bottom: '90px' } }));
  }

  if (mode === 'print') {
    // La hoja sale como la impresora la entrega (según la calibración): flecha hacia la impresora,
    // hacia ti (dibujo girado) o con el lado en blanco a la vista.
    const of = opts.outputFace || null;
    root.append(tray('Salida de papel'), paper({ printed: of !== 'down', cls: of === 'up-out' ? 'out flip-out' : 'out' }));
    root.append(tag(opts.text || 'Imprimiendo…', { cls: 'amber', ic: 'hourglass', style: { left: 'calc(50% + 190px)', top: '60px' } }));
  }

  if (mode === 'flip') {
    const faceUp = opts.faceUp !== false;
    root.append(
      top ? feeder() : tray(),
      h('div.out-spot', { style: { left: 'calc(50% + 210px)', bottom: '76px', right: 'auto' } }),
      tag('Hojas ya impresas', { style: { left: 'calc(50% + 222px)', bottom: '186px' } }),
    );
    const mover = paper({ cls: 'mover' });
    mover.style.setProperty('--flip', faceUp ? '0deg' : '180deg');
    mover.style.setProperty('--dx', '285px');
    root.append(mover);
    const faceTag = top
      ? (faceUp ? 'Cara impresa hacia TI' : 'Cara impresa hacia ATRÁS')
      : (faceUp ? 'Cara impresa hacia ARRIBA' : 'Cara impresa hacia ABAJO');
    root.append(
      tag(faceTag, { cls: 'red', ic: faceUp ? 'arrowUp' : 'flip', style: top ? { right: 'calc(50% + 140px)', top: '16px' } : { left: 'calc(50% - 330px)', bottom: '96px' } }),
      tag(top ? 'Borde de arriba hacia ABAJO' : 'Borde de arriba hacia ADENTRO', { cls: 'red', ic: 'arrowUp', style: top ? { right: 'calc(50% + 140px)', top: '58px' } : { left: 'calc(50% - 330px)', bottom: '52px' } }),
    );
  }

  if (mode === 'done') {
    root.append(tray('Listo'), paper(), paper());
    root.append(h('span.stamp.in-scene', opts.stamp || 'IMPRESO'));
  }
  return root;
}

// ---------- Guía de 3 pasos para dar vuelta el mazo ----------

/**
 * Qué movimiento hay que hacer con el mazo.
 * outputFace: cómo sale de la impresora ('up-in' flecha hacia la impresora, 'up-out' flecha hacia ti, 'down' en blanco)
 * faceUp: si va a la bandeja con lo impreso hacia arriba.
 */
export function movementFor(outputFace, faceUp) {
  if (outputFace === 'up-in') return faceUp ? 'none' : 'book';
  if (outputFace === 'up-out') return faceUp ? 'rotate' : 'calendar';
  if (outputFace === 'down') return faceUp ? 'book' : 'none';
  return faceUp ? 'none' : 'book'; // sin dato: guía genérica
}

/** Frase de la guía por voz para el movimiento del mazo. */
export function voiceForMovement(profile) {
  const faceUp = profile.faceUp !== false;
  const move = movementFor(profile.outputFace || null, faceUp);
  if (isTop(profile)) {
    // Frases propias del alimentador de arriba («de pie», «mirando hacia ti/atrás», «flecha hacia abajo»)
    if (move === 'none') return faceUp ? 'mov-top-none-ti' : 'mov-top-none-atras';
    if (move === 'book') return faceUp ? 'mov-top-book-ti' : 'mov-top-book-atras';
    return move === 'rotate' ? 'mov-top-rotate' : 'mov-top-calendar';
  }
  if (move === 'none') return faceUp ? 'mov-none-arriba' : 'mov-none-abajo';
  if (move === 'book') return faceUp ? 'mov-book-arriba' : 'mov-book-abajo';
  return move === 'rotate' ? 'mov-rotate' : 'mov-calendar';
}

const MOVE_TEXT = {
  none: { short: 'No lo des vuelta', long: 'No lo des vuelta ni lo gires: solo trasládalo tal como está.' },
  rotate: { short: 'Gíralo sobre la mesa', long: 'Gíralo sobre la mesa, como un volante, hasta que la parte de arriba de las hojas apunte hacia la impresora. No lo des vuelta.' },
  book: { short: 'Dalo vuelta hacia el lado', long: 'Dalo vuelta como la página de un libro: hacia el lado, por el borde largo.' },
  calendar: { short: 'Dalo vuelta hacia ti', long: 'Dalo vuelta hacia ti, como la hoja de un calendario: por el borde de abajo.' },
};

const ROT_ARROW = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 40a20 20 0 1 0 6-22"/><path d="M20 6v12h12"/></svg>';

function initialPose(outputFace) {
  if (outputFace === 'up-out') return { rx: 0, ry: 0, rz: 180 };
  if (outputFace === 'down') return { rx: 0, ry: 180, rz: 0 };
  return { rx: 0, ry: 0, rz: 0 };
}

function finalPose(p, move) {
  if (move === 'rotate') return { ...p, rz: p.rz + 180 };
  if (move === 'book') return { ...p, ry: p.ry + 180 };
  if (move === 'calendar') return { ...p, rx: p.rx + 180 };
  return { ...p };
}

const tf = (x, y, p, s = 1) => `translate(${x}px, ${y}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg) scale(${s})`;

function sideViewTop(faceUp) {
  // Vista de lado con alimentador de arriba: tú a la izquierda, el mazo de pie e inclinado hacia atrás.
  // faceUp = lo impreso mirando hacia ti (cara izquierda del mazo).
  const lx = faceUp ? 120 : 136;
  return h('div.side-view', { 'aria-hidden': 'true', html: `
    <svg viewBox="0 0 230 90" fill="none">
      <text x="8" y="12" font-size="10" fill="#AEBDD0" font-family="Inter, Segoe UI, sans-serif">Vista de lado</text>
      <text x="10" y="58" font-size="9.5" fill="#AEBDD0" font-family="Inter, Segoe UI, sans-serif">tú</text>
      <path d="M24 54h12m-5-5 5 5-5 5" stroke="#AEBDD0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="60" y="48" width="160" height="34" rx="8" fill="#2b3d5a" stroke="#405776"/>
      <text x="196" y="70" text-anchor="middle" font-size="9.5" fill="#AEBDD0" font-family="Inter, Segoe UI, sans-serif">impresora</text>
      <path d="M128 48 L 140 14 L 158 14 L 146 48 Z" fill="#F4F1EA"/>
      <path d="M${lx} 46 L ${lx + 11} 16" stroke="#DC2626" stroke-width="4"/>
      <path d="M150 30v14m-4-5 4 5 4-5" stroke="#FCA5A5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${faceUp ? 50 : 162}" y="24" font-size="11" font-weight="700" fill="#FCA5A5" font-family="Inter, Segoe UI, sans-serif">${faceUp ? 'lo impreso hacia ti' : 'impreso atrás'}</text>
    </svg>` });
}

function sideView(faceUp) {
  // Vista de lado: la bandeja, el mazo y dónde queda lo impreso.
  const printedY = faceUp ? 30 : 44;
  return h('div.side-view', { 'aria-hidden': 'true', html: `
    <svg viewBox="0 0 230 90" fill="none">
      <text x="8" y="12" font-size="10" fill="#AEBDD0" font-family="Inter, Segoe UI, sans-serif">Vista de lado</text>
      <rect x="168" y="14" width="56" height="52" rx="8" fill="#2b3d5a" stroke="#405776"/>
      <text x="196" y="44" text-anchor="middle" font-size="9.5" fill="#AEBDD0" font-family="Inter, Segoe UI, sans-serif">impresora</text>
      <path d="M8 62h158" stroke="#405776" stroke-width="3" stroke-linecap="round"/>
      <rect x="20" y="38" width="118" height="16" rx="2" fill="#F4F1EA"/>
      <path d="M20 ${printedY + 8}h118" stroke="#DC2626" stroke-width="4"/>
      <path d="M142 46h20m-6-5 6 5-6 5" stroke="#FCA5A5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="20" y="${faceUp ? 31 : 80}" font-size="11" font-weight="700" fill="#FCA5A5" font-family="Inter, Segoe UI, sans-serif">lo impreso ${faceUp ? 'arriba' : 'abajo'}</text>
    </svg>` });
}

/**
 * Guía animada en 3 pasos según la calibración de la impresora.
 * profile: { outputFace, faceUp }, opts: { sheets, autoplay }
 */
export function paperGuide(profile, { sheets = null, compact = false } = {}) {
  const out = profile.outputFace || null;
  const faceUp = profile.faceUp !== false;
  const move = movementFor(out, faceUp);
  const p0 = initialPose(out);
  const p1 = finalPose(p0, move);
  const n = sheets ? `las ${sheets} hojas` : 'las hojas';
  const top = isTop(profile);
  // Con alimentador de arriba, el mazo que quedó acostado con la flecha hacia la impresora se levanta
  // inclinando el borde de la flecha hacia abajo: la cara de arriba pasa a mirar hacia ti.
  const p2 = top ? { ...p1, rx: p1.rx + 58 } : p1;

  const steps = [
    { t: 'Toma el mazo', d: out === 'down' ? `Toma ${n} que salieron, sin desordenarlas. Se ve el lado en blanco.` : out ? `Toma ${n} que salieron, sin desordenarlas. Se ve lo impreso.` : `Toma ${n} que salieron, sin desordenarlas.` },
    { t: MOVE_TEXT[move].short, d: MOVE_TEXT[move].long },
    top
      ? { t: 'Ponlo en el alimentador', d: `Ponlo de pie en el alimentador de arriba, con lo impreso ${faceWord(profile, faceUp)} y la parte de arriba de las hojas hacia abajo, hacia la ranura.${out === 'down' && faceUp ? ' Si la parte de arriba apunta hacia ti, gíralo sobre la mesa antes de levantarlo.' : ''}` }
      : { t: 'Ponlo en la bandeja', d: `Con lo impreso hacia ${faceUp ? 'arriba' : 'abajo'} y la parte de arriba de las hojas hacia adentro de la impresora.${out === 'down' && faceUp ? ' Si la parte de arriba apunta hacia ti, gíralo sobre la mesa.' : ''}` },
  ];

  const mover = paper({ cls: 'mover-js' });
  const badge = h('div.move-badge', { class: move }, h('span.rot', { html: ROT_ARROW }), h('b', MOVE_TEXT[move].short));
  const sc = h('div.scene.guide-scene', { class: [compact && 'compact', top && 'feed-top'].filter(Boolean).join(' '), role: 'img', 'aria-label': steps.map((s, i) => `${i + 1}. ${s.d}`).join(' ') },
    ...printerBody(), top ? feeder() : h('div.tray', h('span.tray-label', 'Bandeja de papel')),
    h('div.out-spot', h('span.tray-label', 'Salida')), mover, badge, top ? sideViewTop(faceUp) : sideView(faceUp),
    h('div.arrow-legend', h('span.arrow', { html: ARROW }), 'La flecha marca la parte de arriba de tus páginas'));

  const items = steps.map((s, i) => h('li', { onclick: () => goTo(i, true) }, h('span.gn', String(i + 1)), h('span', h('b', s.t), h('span', s.d))));
  const list = h('ol.guide-steps', items);
  const prevB = h('button.btn', { onclick: () => goTo(step - 1, true), 'aria-label': 'Paso anterior', title: 'Paso anterior' }, icon('chevronLeft', 'sm'));
  const replayB = h('button.btn', { onclick: () => { manual = false; goTo(0); }, 'aria-label': 'Repetir la animación', title: 'Repetir' }, icon('refresh', 'sm'));
  const nextB = h('button.btn', { onclick: () => goTo(step + 1, true), 'aria-label': 'Paso siguiente', title: 'Paso siguiente' }, icon('chevronRight', 'sm'));
  sc.append(h('div.guide-ctl', prevB, replayB, nextB));
  const root = h('div.guide', { class: compact ? 'compact' : '' }, sc, list);

  const OUT = { x: 275, y: -42 }, MID = { x: 150, y: -36 }, IN = { x: 0, y: 0 };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let step = 0, manual = false, timer = null, anim = null;

  // Posición de la salida medida en pantalla, para que funcione con cualquier ancho de ventana.
  function measure() {
    const spot = sc.querySelector('.out-spot')?.getBoundingClientRect();
    const box = sc.getBoundingClientRect();
    if (!spot || !box.width) return;
    const base = box.bottom - parseFloat(getComputedStyle(mover).bottom || '22');
    OUT.x = Math.round(spot.left + spot.width / 2 - (box.left + box.width / 2));
    OUT.y = Math.round(spot.bottom - base);
    MID.x = Math.round(OUT.x * 0.55);
    if (top) {
      // Destino: el alimentador detrás de la impresora (más arriba en el dibujo).
      const fd = sc.querySelector('.feeder')?.getBoundingClientRect();
      // centro de la hoja sobre el centro del alimentador
      if (fd) IN.y = Math.round((fd.top + fd.bottom) / 2 - (base - mover.offsetHeight / 2));
    }
  }

  function pose(i) {
    if (i === 0) return tf(OUT.x, OUT.y, p0);
    if (i === 1) return tf(MID.x, MID.y, p1, 1.08);
    return tf(IN.x, IN.y, p2, top ? 0.92 : 1);
  }

  function goTo(i, byUser = false) {
    if (byUser) manual = true;
    i = Math.max(0, Math.min(2, i));
    measure();
    anim?.cancel();
    let frames;
    // Sin animar la opacidad: aplana el 3D y la cara de atrás se vería al revés.
    if (i === 0) frames = [{ transform: tf(OUT.x, OUT.y + 30, p0, 0.96) }, { transform: pose(0) }];
    else if (i === step + 1 && i === 1) frames = [{ transform: pose(0) }, { transform: tf(MID.x, MID.y, p0, 1.08), offset: 0.3 }, { transform: pose(1) }];
    else frames = [{ transform: pose(step) }, { transform: pose(i) }];
    anim = mover.animate(frames, { duration: reduce ? 1 : i === 1 && step === 0 ? 1700 : 1000, easing: 'cubic-bezier(0.23,1,0.32,1)', fill: 'forwards' });
    step = i;
    items.forEach((li, k) => { li.classList.toggle('now', k === i); li.classList.toggle('done', k < i); });
    sc.dataset.step = String(i + 1);
    prevB.disabled = i === 0;
    nextB.disabled = i === 2;
    clearTimeout(timer);
    if (!manual) timer = setTimeout(tick, [2400, 3400, 3200][i]);
  }

  function tick() {
    if (!root.isConnected) { clearTimeout(timer); return; }
    goTo(step === 2 ? 0 : step + 1);
  }

  requestAnimationFrame(() => goTo(0));
  root.goTo = (i) => goTo(i, true); // para la autoprueba
  return root;
}

// Dibujos propios de los dos tipos de impresora (vista de 3/4, sin marca).
const FEED_ART = {
  bottom: `<svg viewBox="0 0 180 120" fill="none" aria-hidden="true">
    <path d="M30 40 L 150 40 L 160 94 L 20 94 Z" fill="#2b3d5a" stroke="#405776" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M34 34 L 146 34 L 150 44 L 30 44 Z" fill="#1d2b42" stroke="#405776" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="52" y="58" width="76" height="6" rx="2" fill="#070d18"/>
    <path d="M56 62 L 124 62 L 132 74 L 48 74 Z" fill="#F4F1EA"/>
    <rect x="26" y="80" width="128" height="22" rx="4" fill="#1d2b42" stroke="#DC2626" stroke-width="2.2" stroke-dasharray="5 3"/>
    <path d="M36 88 L 144 88" stroke="#F4F1EA" stroke-width="4" stroke-linecap="round"/>
    <path d="M36 94 L 144 94" stroke="#F4F1EA" stroke-width="4" stroke-linecap="round"/>
    <circle cx="140" cy="52" r="3" fill="#10b981"/>
  </svg>`,
  top: `<svg viewBox="0 0 180 120" fill="none" aria-hidden="true">
    <path d="M62 44 L 76 6 L 124 6 L 118 44 Z" fill="#F4F1EA" stroke="#DC2626" stroke-width="2.2" stroke-dasharray="5 3" stroke-linejoin="round"/>
    <path d="M84 16 h28 M82 22 h24 M80 28 h28" stroke="#b9b2a3" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M30 46 L 150 46 L 160 100 L 20 100 Z" fill="#2b3d5a" stroke="#405776" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M34 40 L 146 40 L 150 50 L 30 50 Z" fill="#1d2b42" stroke="#405776" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="52" y="74" width="76" height="6" rx="2" fill="#070d18"/>
    <path d="M56 78 L 124 78 L 134 94 L 46 94 Z" fill="#F4F1EA"/>
    <circle cx="140" cy="62" r="3" fill="#10b981"/>
  </svg>`,
};

/** Opciones para «¿por dónde pones el papel?». */
export function feedChoices(onPick, current = null) {
  const opts = [
    { key: 'bottom', title: 'El papel va abajo', text: 'En un cajón o bandeja adelante, con las hojas acostadas. Por ejemplo, Brother DCP-T.' },
    { key: 'top', title: 'El papel va arriba', text: 'En un alimentador atrás, con las hojas de pie. Por ejemplo, muchas Canon serie G y Epson EcoTank.' },
  ];
  return h('div.choices.feed-choices', opts.map((o) =>
    h('button.choice', { class: current === o.key ? 'current' : '', 'aria-pressed': String(current === o.key), onclick: () => onPick(o.key) },
      h('span.feed-art', { html: FEED_ART[o.key] }),
      h('span', h('b', o.title), h('span', o.text)))));
}

/** Opciones para «¿cómo salen las hojas?». */
export function outputChoices(onPick) {
  const opts = [
    { key: 'up-in', title: 'Veo lo impreso, con la parte de arriba hacia la impresora', face: true, down: false },
    { key: 'up-out', title: 'Veo lo impreso, con la parte de arriba hacia mí', face: true, down: true },
    { key: 'down', title: 'Veo el lado en blanco', text: 'lo impreso quedó por abajo', face: false },
  ];
  return h('div.choices.out-choices', opts.map((o) =>
    h('button.choice', { onclick: () => onPick(o.key) },
      h('span.mini-out', h('span.mini-printer'), o.face ? mini('', { down: o.down }) : h('span.mini.blank-mini')),
      h('span', h('b', o.title), o.text ? h('span', o.text) : null))));
}

/** Miniaturas de hoja para las opciones de calibración. */
export function mini(num, { down = false, front = false, over = false } = {}) {
  return h('span.mini', { class: [down && 'down', front && 'front', over && 'over'].filter(Boolean).join(' ') },
    h('span.ar', { html: '<svg viewBox="0 0 10 10" fill="currentColor"><path d="M5 0 10 7H0z"/></svg>' }),
    h('b', String(num)));
}
