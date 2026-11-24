// Pequeñas utilidades de interfaz sin framework.
import printer from 'lucide-static/icons/printer.svg?raw';
import fileText from 'lucide-static/icons/file-text.svg?raw';
import fileSheet from 'lucide-static/icons/file-spreadsheet.svg?raw';
import presentation from 'lucide-static/icons/presentation.svg?raw';
import image from 'lucide-static/icons/image.svg?raw';
import file from 'lucide-static/icons/file.svg?raw';
import folderOpen from 'lucide-static/icons/folder-open.svg?raw';
import search from 'lucide-static/icons/search.svg?raw';
import settings from 'lucide-static/icons/settings-2.svg?raw';
import refresh from 'lucide-static/icons/refresh-cw.svg?raw';
import check from 'lucide-static/icons/check.svg?raw';
import chevronLeft from 'lucide-static/icons/chevron-left.svg?raw';
import chevronRight from 'lucide-static/icons/chevron-right.svg?raw';
import minus from 'lucide-static/icons/minus.svg?raw';
import plus from 'lucide-static/icons/plus.svg?raw';
import rotate from 'lucide-static/icons/rotate-cw.svg?raw';
import layers from 'lucide-static/icons/layers.svg?raw';
import alert from 'lucide-static/icons/triangle-alert.svg?raw';
import hourglass from 'lucide-static/icons/hourglass.svg?raw';
import hand from 'lucide-static/icons/hand.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';
import external from 'lucide-static/icons/external-link.svg?raw';
import sliders from 'lucide-static/icons/sliders-horizontal.svg?raw';
import sparkles from 'lucide-static/icons/sparkles.svg?raw';
import flip from 'lucide-static/icons/flip-vertical-2.svg?raw';
import arrowUp from 'lucide-static/icons/arrow-up.svg?raw';
import info from 'lucide-static/icons/info.svg?raw';
import book from 'lucide-static/icons/book-open.svg?raw';
import arrowLeft from 'lucide-static/icons/arrow-left.svg?raw';
import circleCheck from 'lucide-static/icons/circle-check.svg?raw';

const ICONS = {
  printer, fileText, fileSheet, presentation, image, file, folderOpen, search, settings, refresh, check,
  chevronLeft, chevronRight, minus, plus, rotate, layers, alert, hourglass, hand, x, external, sliders,
  sparkles, flip, arrowUp, info, book, arrowLeft, circleCheck,
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `icon ${cls}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = (ICONS[name] || '').replace(/<!--.*?-->/s, '');
  return span;
}

/** h('div.clase#id', {attrs}, ...hijos) */
export function h(sel, attrs, ...children) {
  if (attrs instanceof Node || typeof attrs === 'string' || Array.isArray(attrs)) {
    children.unshift(attrs);
    attrs = null;
  }
  const [tag, ...rest] = sel.split(/(?=[.#])/);
  const el = document.createElement(tag || 'div');
  for (const r of rest) {
    if (r[0] === '.') el.classList.add(r.slice(1));
    else if (r[0] === '#') el.id = r.slice(1);
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className += ` ${v}`;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

let toastTimer;
export function toast(msg, kind = 'info') {
  document.querySelector('.toast')?.remove();
  const t = h('div.toast', { class: kind, role: 'status' }, icon(kind === 'warn' ? 'alert' : 'info'), msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 5200);
}

export const KIND_LABEL = {
  pdf: 'PDF', word: 'DOC', excel: 'XLS', powerpoint: 'PPT', image: 'IMG', text: 'TXT', web: 'WEB', other: 'ARCH',
};

export function badge(kind) {
  return h('span.badge', { class: kind }, KIND_LABEL[kind] || 'ARCH');
}

export function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

const rtf = new Intl.RelativeTimeFormat('es-CL', { numeric: 'auto' });
export function relTime(ms) {
  const diff = (ms - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'recién';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(ms).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function duration(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 50) return `${Math.max(5, Math.round(sec / 5) * 5)} s`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function folderName(dir) {
  const parts = dir.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join(' › ');
}
