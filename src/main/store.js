'use strict';
// Configuración persistente (JSON en la carpeta de datos de la app).
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULT_PRINTER = {
  calibrated: false,
  invert: true,
  rotate: false,
  faceUp: true,       // poner el mazo con la cara impresa hacia arriba
  outputFace: null,   // cómo salen las hojas: 'up-in' | 'up-out' | 'down' | null (no se sabe)
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

module.exports = { get, set, printer, updatePrinter, DEFAULT_PRINTER };
