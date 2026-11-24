// Genera build/icon.png y assets/icon.png (512 px) desde el logo SVG de la app.
// Uso: electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'main.js'), 'utf8');
const svg = src.match(/export const MARK = `([\s\S]*?)`;/)[1]
  .replace('<svg ', '<svg width="512" height="512" ');

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`;
  const frame = new Promise((r) => win.webContents.on('paint', (_e, _d, image) => r(image)));
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const img = (await frame).resize({ width: 512, height: 512 });
  for (const out of ['build/icon.png', 'assets/icon.png']) fs.writeFileSync(path.join(__dirname, '..', out), img.toPNG());
  console.log('icono generado');
  app.quit();
});
