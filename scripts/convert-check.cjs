// Prueba manual de conversión: electron scripts/convert-check.cjs <archivo> [<archivo>...]
const { app } = require('electron');
const convert = require('../src/main/convert');
const compose = require('../src/main/compose');

app.on('window-all-closed', () => {}); // las ventanas ocultas de conversión no deben cerrar la prueba
app.whenReady().then(async () => {
  for (const f of process.argv.slice(2).filter((a) => !a.startsWith('-') && a !== '.' && !a.endsWith('convert-check.cjs'))) {
    const t0 = Date.now();
    try {
      const r = await convert.toPdf(f, { pageSize: 'letter' });
      console.log(`OK  ${r.kind.padEnd(10)} ${String(await compose.pageCount(r.pdfPath)).padStart(3)} pág  ${((Date.now() - t0) / 1000).toFixed(1)} s  vía ${r.via}  ${f}`);
    } catch (e) {
      console.log(`ERR ${f}: ${e.message}`);
    }
  }
  app.quit();
});
