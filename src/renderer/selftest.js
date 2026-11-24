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
  // Impresora simulada: nada llega al papel y la configuración real no cambia.
  let fakeProfile = null;
  app.api = {
    ...real,
    print: async () => { await wait(300); return { ref: 'test' }; },
    queue: async () => [{ name: '', printed: 0, total: 0, status: '' }],
    learnSpeed: async () => null,
    printerProfile: async (n) => (fakeProfile ||= { ...(await real.printerProfile(n)), calibrated: true, secPerSheet: 9 }),
    updatePrinter: async (_n, patch) => (fakeProfile = { ...fakeProfile, ...patch }),
  };
  app.S.printer ||= 'Impresora de prueba';
  app.S.printers = app.S.printers.length ? app.S.printers : [{ name: 'Impresora de prueba', displayName: 'Impresora de prueba' }];
  const sizes = [[1320, 840], [1040, 680]];

  for (const [w, hgt] of sizes) {
    const tag = `${w}`;
    await T.resize(w, hgt);
    fakeProfile = null;
    app.S.selected = null; app.S.prepared = null; app.S.copies = 10; app.S.range = ''; app.S.previewMode = 'pages';
    app.go('home');
    app.rescan();
    await wait(2500);
    await T.capture(`${tag}-01-inicio`);

    const name = samplePath.split(/[\\/]/).pop();
    app.current.select({ path: samplePath, name, dir: samplePath.slice(0, -name.length - 1), kind: 'pdf', size: 1, mtime: Date.now() });
    await until(() => app.S.prepared);
    await wait(1500);
    await T.capture(`${tag}-02-vista-previa`);

    app.current.setMode('sheets');
    await wait(1800);
    document.querySelector('.flip')?.classList.add('back');
    await wait(900);
    await T.capture(`${tag}-03-hojas`);
    app.current.setMode('pages');

    app.go('printer');
    await wait(1200);
    await T.capture(`${tag}-04-impresora`);

    // Flujo de impresión
    app.go('run', { job: { file: app.S.selected, pdfPath: app.S.prepared.pdfPath, copies: 10, range: '' } });
    await until(() => document.querySelector('.stage h1')?.textContent.includes('bandeja'));
    await wait(700);
    await T.capture(`${tag}-05-papel`);
    clickText('Imprimir caras de adelante');
    await until(() => document.querySelector('.fill')?.style.width && document.querySelector('.stage h1')?.textContent.includes('adelante'));
    await wait(3200);
    await T.capture(`${tag}-06-imprimiendo`);
    clickText('Ya salieron todas');
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Toma las'));
    await wait(2600);
    await T.capture(`${tag}-07-dar-vuelta`);
    clickText('Ya las puse');
    await until(() => document.querySelector('.stage h1')?.textContent.includes('reversos'));
    await wait(800);
    clickText('Ya salieron todas');
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Listo'));
    await wait(1200);
    await T.capture(`${tag}-08-listo`);

    // Calibración
    app.go('calibrate', { returnTo: 'home' });
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Enseñémosle'));
    await wait(1600);
    await T.capture(`${tag}-09-calibrar`);
    clickText('Empezar la prueba');
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Pon 2 hojas'));
    clickText('Imprimir frentes');
    await until(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Ya salieron todas')));
    clickText('Ya salieron todas');
    await until(() => document.querySelector('.stage h1')?.textContent.includes('Toma las 2'));
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
  }
  await T.done();
}
