// Genera una copia de un PPD con los nombres de opciones y valores en español, para que el diálogo de
// impresión de cualquier programa (KDE, GTK, LibreOffice, navegadores) los muestre así.
// Solo cambia las etiquetas que ve la persona: las palabras internas (BRSlowDrying=ON…) quedan iguales,
// así que el driver funciona igual.
// Uso: node scripts/ppd-es.mjs <entrada.ppd> <salida.ppd>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('Uso: node scripts/ppd-es.mjs <entrada.ppd> <salida.ppd>');
  process.exit(1);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const T = JSON.parse(fs.readFileSync(path.join(here, '../src/shared/cups-es.json'), 'utf8'));

// Los PPD suelen declarar ISOLatin1: se lee y escribe en latin1 (á, é, ñ, ·, × caben).
const src = fs.readFileSync(input, 'latin1');
const enc = /^\*LanguageEncoding:\s*(\S+)/m.exec(src)?.[1] || 'ISOLatin1';
if (!/^ISOLatin1$/i.test(enc)) {
  console.error(`El PPD usa ${enc}; este script solo maneja ISOLatin1.`);
  process.exit(1);
}

const SIZE_KEYS = new Set(['PageSize', 'PageRegion', 'ImageableArea', 'PaperDimension']);
function choiceMap(key) {
  if (SIZE_KEYS.has(key)) return T.pageSizes;
  const m = T.options[key]?.choices;
  return typeof m === 'string' ? T[m] : m || null;
}
function choiceText(key, choice, fallback) {
  const m = choiceMap(key);
  if (m && m[choice]) return m[choice];
  if (T.options[key] && T.common[choice]) return T.common[choice];
  return fallback;
}
function latin1Safe(s) {
  // Lo que no quepa en latin1 se reemplaza por algo legible en vez de romper el archivo
  return s.replace(/[^\x00-\xff]/g, (c) => ({ '—': '-', '–': '-', '“': '"', '”': '"', '’': "'" }[c] || '?'));
}

let changed = 0;
const out = src.split(/\r?\n/).map((line) => {
  // *OpenUI *BRSlowDrying/Slow Drying Paper: PickOne
  let m = /^(\*OpenUI\s+\*)([^/:\s]+)\/([^:]*)(:.*)$/.exec(line);
  if (m && T.options[m[2]]?.label) { changed++; return `${m[1]}${m[2]}/${latin1Safe(T.options[m[2]].label)}${m[4]}`; }
  // *OpenGroup: Print Settings (Advanced)   o   *OpenGroup: Nombre/Etiqueta
  m = /^\*OpenGroup:\s*([^/]+?)(?:\/(.*))?\s*$/.exec(line);
  if (m) {
    const es = T.groups[(m[2] || m[1]).trim()];
    if (es) { changed++; return `*OpenGroup: ${m[1].trim()}/${latin1Safe(es)}`; }
    return line;
  }
  // *BRSlowDrying ON/On: "..."   (valor de una opción con etiqueta)
  m = /^\*([^\s/:*]+)\s+([^/:\s]+)\/([^:]*)(:.*)$/.exec(line);
  if (m && (T.options[m[1]] || SIZE_KEYS.has(m[1]))) {
    const es = choiceText(m[1], m[2], null);
    if (es) { changed++; return `*${m[1]} ${m[2]}/${latin1Safe(es)}${m[4]}`; }
  }
  return line;
}).join('\n');

fs.writeFileSync(output, out, 'latin1');
console.log(`Listo: ${changed} etiquetas en español → ${output}`);
