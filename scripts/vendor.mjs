// Copia SumatraPDF (incluido en el paquete npm pdf-to-printer) a vendor/win/ para el instalador de Windows.
import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.join('node_modules', 'pdf-to-printer', 'dist');
const exe = fs.readdirSync(srcDir).find((f) => /^SumatraPDF.*\.exe$/i.test(f));
if (!exe) throw new Error('No se encontró SumatraPDF en pdf-to-printer');
fs.mkdirSync(path.join('vendor', 'win'), { recursive: true });
fs.copyFileSync(path.join(srcDir, exe), path.join('vendor', 'win', 'SumatraPDF.exe'));
fs.mkdirSync(path.join('vendor', 'linux'), { recursive: true });
fs.writeFileSync(path.join('vendor', 'linux', 'LEEME.txt'), 'En Linux se usa CUPS (lp) del sistema.\n');
console.log(`vendor/win/SumatraPDF.exe ← ${exe}`);
