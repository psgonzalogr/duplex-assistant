'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a).then((r) => {
  if (r && r.__error) {
    const e = new Error(r.message);
    e.code = r.code;
    throw e;
  }
  return r;
});

contextBridge.exposeInMainWorld('da', {
  info: () => invoke('app:info'),
  openExternal: (url) => invoke('app:open-external', url),
  printers: () => invoke('printers:list'),
  printerProfile: (name) => invoke('printer:get', name),
  updatePrinter: (name, patch) => invoke('printer:update', name, patch),
  printerOptions: (name) => invoke('printer:options', name),
  driverSettings: (name) => invoke('printer:driver-settings', name),
  resetDriverSettings: (name) => invoke('printer:driver-reset', name),
  setLastPrinter: (name) => invoke('printer:set-last', name),

  scan: () => invoke('scan:start'),
  cancelScan: () => invoke('scan:cancel'),
  onScanBatch: (cb) => {
    const h = (_e, files) => cb(files);
    ipcRenderer.on('scan:batch', h);
    return () => ipcRenderer.removeListener('scan:batch', h);
  },
  pickFile: () => invoke('file:pick'),
  pathForFile: (f) => webUtils.getPathForFile(f),
  prepare: (file, opts) => invoke('file:prepare', file, opts),
  readPdf: (pdfPath) => invoke('file:read-pdf', pdfPath),
  reveal: (file) => invoke('file:reveal', file),

  planJob: (args) => invoke('job:plan', args),
  print: (args) => invoke('job:print', args),
  queue: (printer) => invoke('job:queue', printer),
  calibration: () => invoke('job:calibration'),
  learnSpeed: (printer, sheets, seconds) => invoke('job:learn-speed', printer, sheets, seconds),
});

// Solo responde cuando la app se abrió en modo autoprueba (DA_SELFTEST).
contextBridge.exposeInMainWorld('daTest', {
  capture: (name) => ipcRenderer.invoke('selftest:capture', name),
  resize: (w, h) => ipcRenderer.invoke('selftest:resize', w, h),
  done: () => ipcRenderer.invoke('selftest:done'),
});
