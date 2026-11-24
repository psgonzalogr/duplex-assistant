'use strict';
// Configuración persistente (JSON en la carpeta de datos de la app).
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULT_PRINTER = {
  calibrated: false,
  invert: true,
  rotate: false,
  feed: null,         // por dónde entra el papel: 'bottom' (cajón o bandeja abajo) | 'top' (alimentador de arriba) | null
  faceUp: true,       // poner el mazo con la cara impresa hacia arriba (en un alimentador de arriba: hacia ti)
  outputFace: null,   // cómo salen las hojas: 'up-in' | 'up-out' | 'down' | null (no se sabe)
  invertFix: false,   // la calibración vio que esta impresora hace lo contrario de lo esperado
  riskAccepted: false, // el usuario saltó la calibración aceptando el riesgo
  capacity: 100,      // hojas por pasada (bandeja)
  secPerSheet: 9,     // se aprende con cada impresión
  paper: 'auto',
  color: 'auto',
  cups: {},
};

let data = null;
const file = () => path.join(app.getPath('userData'), 'config.json');

function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { data = {}; }
  data.printers ||= {};
  return data;
}
function save() {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(data, null, 2));
}

function get(key, fallback) { return load()[key] ?? fallback; }
function set(key, value) { load()[key] = value; save(); }

function printer(name) {
  const p = load().printers[name] || {};
  return { ...DEFAULT_PRINTER, ...p, cups: { ...(p.cups || {}) } };
}
function updatePrinter(name, patch) {
  load().printers[name] = { ...printer(name), ...patch };
  save();
  return printer(name);
}

const { keepsOrder, effectiveInvert } = require('./compose');

module.exports = { get, set, printer, updatePrinter, keepsOrder, effectiveInvert, DEFAULT_PRINTER };
