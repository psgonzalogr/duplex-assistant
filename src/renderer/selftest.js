import { startTour } from './tour.js';
// Autoprueba visual: recorre las pantallas con una impresora simulada y guarda capturas.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = fn();
    if (v) return v;
    await wait(100);
  }
  throw new Error('selftest: tiempo agotado');
}

function clickText(text) {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(text) && !x.disabled);
  if (!b) throw new Error(`selftest: no hay botón «${text}»`);
  b.click();
}

export async function selftest(app, samplePath) {
  const T = window.daTest;
  const real = window.da;
  // Las capturas son públicas: se desenfocan los nombres de archivo de la lista.
  document.head.append(Object.assign(document.createElement('style'), {
    textContent: '.file-row .fname { filter: blur(5px); }',
  }));
  // Impresora simulada: nada llega al papel y la configuración real no cambia.
  let fakeProfile = null;
  app.api = {
    ...real,
    print: async () => { await wait(300); return { ref: 'test' }; },
    queue: async () => [{ name: '', printed: 0, total: 0, status: '' }],
    learnSpeed: async () => null,
    printerProfile: async (n) => (fakeProfile ||= { ...(await real.printerProfile(n)), calibrated: true, secPerSheet: 9, faceUp: true, outputFace: 'up-out', feed: 'bottom', stackReversed: false }),
    updatePrinter: async (_n, patch) => (fakeProfile = { ...fakeProfile, ...patch }),
    settings: async () => fakeSettings,
    setSettings: async (p) => (fakeSettings = { ...fakeSettings, ...p }),
  };
  // Sin audio y con preferencias simuladas: la autoprueba no suena ni cambia la configuración real.
  window.__daMute = true;
  let fakeSettings = { voice: true, sounds: true, onboarded: true };
  app.S.settings = fakeSettings;
  app.applySettings();
  // Documentos de ejemplo: las capturas son públicas y no deben mostrar archivos reales del equipo.
  const name0 = samplePath.split(/[\\/]/).pop();
  const dir0 = samplePath.slice(0, -name0.length - 1);
  const H = 3600e3, D = 24 * H, now = Date.now();
  const FIX = [
    [name0, dir0, 'pdf', 0.4 * H],
    ['Contrato de arriendo.docx', 'Documentos/Casa', 'word', 2 * H],
    ['Presupuesto familiar 2026.xlsx', 'Documentos/Finanzas', 'excel', 5 * H],
    ['Reunión de apoderados.pptx', 'Escritorio/Colegio', 'powerpoint', 1.5 * D],
    ['Boleta de luz noviembre.pdf', 'Descargas', 'pdf', 2 * D],
    ['Foto credencial.jpg', 'Imágenes', 'image', 3 * D],
    ['Informe de práctica.docx', 'Documentos/Universidad', 'word', 9 * D],
    ['Lista de útiles escolares.pdf', 'Descargas', 'pdf', 12 * D],
    ['Recetas de la abuela.txt', 'Documentos', 'text', 20 * D],
    ['Horario de clases.xlsx', 'Escritorio/Colegio', 'excel', 34 * D],
    ['Manual de la impresora.pdf', 'Documentos/Manuales', 'pdf', 60 * D],
    ['Certificado de alumno regular.pdf', 'Descargas', 'pdf', 75 * D],
  ].map(([name, dir, kind, ago]) => ({ path: `${dir}/${name}`, name, dir, kind, size: 1, mtime: now - ago }));
  FIX[0].path = samplePath;
  app.rescan = async () => { app.S.files = FIX.slice(); app.S.scanning = false; app.current?.onFiles?.(); };

  app.S.printer ||= 'Impresora de prueba';
  app.S.printers = app.S.printers.length ? app.S.printers : [{ name: 'Impresora de prueba', displayName: 'Impresora de prueba' }];
  const sizes = [[1320, 840], [1040, 680]];

  for (const [w, hgt] of sizes) {
    const tag = `${w}`;
    await T.resize(w, hgt);
    fakeProfile = null;
    app.go('welcome');
    await wait(1200);
    await T.capture(`${tag}-00-bienvenida`);
    app.S.selected = null; app.S.prepared = null; app.S.copies = 10; app.S.range = ''; app.S.previewMode = 'pages';
    app.go('home');
    app.rescan();
    await wait(2500);
    await T.capture(`${tag}-01-inicio`);

    app.updater.show({ status: 'available', version: '1.2.0', notes: 'Actualizaciones automáticas desde GitHub.\nMejoras de diseño.' });
    await wait(500);
    await T.capture(`${tag}-12-actualizacion`);
    app.updater.show({ status: 'downloading', version: '1.2.0', percent: 46, transferred: 58e6, total: 125e6 });
    await wait(300);
    await T.capture(`${tag}-13-descargando`);
    app.updater.show({ status: 'ready', version: '1.2.0' });
    await wait(300);
    await T.capture(`${tag}-14-lista`);
    document.querySelector('.uc-close')?.click();
    await wait(300);
    await T.capture(`${tag}-15-boton-barra`);
    app.updater.show({ status: 'none' });

    // Reportar un problema o sugerencia
    clickText('Reportar un problema');
    await until(() => document.querySelector('dialog.feedback[open]'));
    await wait(500);
    await T.capture(`${tag}-25-reportar`);
    document.querySelector('dialog.feedback .fb-close').click();
    await wait(300);

    const name = samplePath.split(/[\\/]/).pop();
    app.current.select({ path: samplePath, name, dir: samplePath.slice(0, -name.length - 1), kind: 'pdf', size: 1, mtime: Date.now() });
    await until(() => app.S.prepared);
    await wait(1500);
    await T.capture(`${tag}-02-vista-previa`);
    {
      const tour = startTour({});
      for (const [k, n] of [[1, 'documentos'], [4, 'hojas'], [7, 'imprimir'], [9, 'botones']]) {
        tour.go(k);
        await wait(700);
        await T.capture(`${tag}-20-tour-${n}`);
      }
      tour.end(false);
      await wait(300);
    }

    app.current.setMode('sheets');
    await wait(1800);
    document.querySelector('.flip')?.classList.add('back');
    await wait(900);
    await T.capture(`${tag}-03-hojas`);
    app.current.setMode('pages');

    app.go('printer');
    await wait(1200);
    await T.capture(`${tag}-04-impresora`);
    document.querySelector('.guide')?.scrollIntoView({ block: 'center' });
    await wait(2600);
    await T.capture(`${tag}-17-impresora-guia`);

    // Advertencia al saltar la calibración
    app.go('calibrate', { returnTo: 'home', skipFirst: true });
    await until(() => document.querySelector('.risk'));
    await wait(700);
    await T.capture(`${tag}-19-riesgo`);
    document.querySelector('#risk-ok').click();
    await wait(300);
    await T.capture(`${tag}-19b-riesgo-aceptado`);
    app.go('home');
    await wait(600);

    // Flujo de impresión
    app.go('run', { job: { file: app.S.selected, pdfPath: app.S.prepared.pdfPath, copies: 10, range: '' } });
    await until(() => document.querySelector('.stage h1')?.textContent.includes('bandeja'));
    await wait(700);
    await T.capture(`${tag}-05-papel`);
    // Según la impresora real, primero van las caras de adelante o las de atrás
    clickText('Imprimir caras de');
    await until(() => document.querySelector('.fill')?.style.width && document.querySelector('.stage h1')?.textContent.includes('Imprimiendo las caras'));
    await wait(3200);
    await T.capture(`${tag}-06-imprimiendo`);
    clickText('Ya salieron todas');
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Toma las'));
    await wait(2600);
    document.querySelector('.guide').goTo(0);
    await wait(1200);
    await T.capture(`${tag}-07-dar-vuelta`);
    document.querySelector('.guide').goTo(1);
    await wait(1000);
    await T.capture(`${tag}-07b-girar`);
    await wait(1200);
    await T.capture(`${tag}-07c-girado`);
    document.querySelector('.guide').goTo(2);
    await wait(1400);
    await T.capture(`${tag}-07d-bandeja`);
    clickText('Ya las puse');
    await until(() => /reversos|caras de adelante/.test(document.querySelector('.stage h1')?.textContent || ''));
    await wait(1200);
    await T.capture(`${tag}-07e-segunda-pasada`);
    clickText('Ya salieron todas');
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Listo'));
    await wait(1200);
    await T.capture(`${tag}-08-listo`);

    // Calibración
    app.go('calibrate', { returnTo: 'home' });
    await until(() => document.querySelector('.feed-choices'));
    await wait(700);
    await T.capture(`${tag}-21-tipo-impresora`);
    document.querySelectorAll('.feed-choices .choice')[0].click();
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Enseñémosle'));
    await wait(1600);
    await T.capture(`${tag}-09-calibrar`);
    clickText('Empezar la prueba');
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Pon 2 hojas'));
    clickText('Imprimir frentes');
    await until(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Ya salieron todas')));
    clickText('Ya salieron todas');
    await until(() => document.querySelector('.out-choices'));
    await wait(600);
    await T.capture(`${tag}-16-salida`);
    document.querySelectorAll('.out-choices .choice')[2].click();
    await until(() => document.querySelector('.stack-choices'));
    await wait(600);
    await T.capture(`${tag}-16b-apilado`);
    document.querySelector('.stack-choices .choice').click();
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Toma las 2'));
    await wait(2000);
    await T.capture(`${tag}-18-calibrar-guia-blanco`);
    clickText('Ya las puse');
    await until(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Ya salieron todas')));
    clickText('Ya salieron todas');
    await until(() => document.querySelector('.choices'));
    await wait(700);
    await T.capture(`${tag}-10-pregunta`);
    document.querySelector('.choice').click();
    await until(() => document.querySelector('.stage h1')?.textContent.includes('calibrada'));
    await wait(1200);
    await T.capture(`${tag}-11-calibrada`);

    // Impresora con alimentador de arriba: calibración e instrucciones para dar vuelta el mazo
    app.go('calibrate', { returnTo: 'home' });
    await until(() => document.querySelector('.feed-choices'));
    document.querySelectorAll('.feed-choices .choice')[1].click();
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Enseñémosle'));
    await wait(3000);
    await T.capture(`${tag}-22-calibrar-arriba`);
    clickText('Empezar la prueba');
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Pon 2 hojas'));
    await wait(1200);
    await T.capture(`${tag}-23-papel-arriba`);
    fakeProfile = { ...fakeProfile, outputFace: 'up-out', calibrated: true };
    app.go('printer');
    await wait(1200);
    document.querySelector('.guide')?.scrollIntoView({ block: 'center' });
    for (const i of [0, 1, 2]) {
      document.querySelector('.guide').goTo(i);
      await wait(1800);
      await T.capture(`${tag}-24-guia-arriba-paso${i + 1}`);
    }
    fakeProfile = { ...fakeProfile, feed: 'bottom', faceUp: true };
  }
  await T.done();
}
