// Nombres en español de las opciones de CUPS (tabla en src/shared/cups-es.json, compartida con scripts/ppd-es.mjs).
import T from '../shared/cups-es.json';

const opt = (key) => T.options[key] || null;

function choiceMap(key) {
  const m = opt(key)?.choices;
  return typeof m === 'string' ? T[m] : m || null;
}

/** Nombre de la opción en español; si no está en la tabla, el que entrega el driver. */
export function optionLabel(key, fallback) {
  return opt(key)?.label || fallback || key;
}

/** Texto en español de un valor («PlainNormal» → «Papel normal · normal»). */
export function choiceLabel(key, choice) {
  if (choice == null) return '—';
  const m = choiceMap(key);
  if (m && m[choice]) return m[choice];
  const bl = /^(.*)\.Borderless$/.exec(choice); // tamaños sin bordes de las colas IPP Everywhere
  if (bl) return `${choiceLabel(key, bl[1])} sin bordes`;
  return T.common[choice] ?? choice;
}

export const optionHint = (key) => opt(key)?.hint || null;
export const optionRecommended = (key) => opt(key)?.recommended || null;
