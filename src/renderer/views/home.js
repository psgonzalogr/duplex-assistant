// Pantalla principal: buscador de documentos · vista previa · panel de impresión.
import { h, icon, clear, badge, plural, relTime, duration, folderName, toast } from '../ui.js';
import { openPdf, renderPage } from '../preview.js';
import { paper } from '../scenes.js';
import { assistPanel } from '../assist.js';

const FILTERS = [
  ['all', 'Todos'], ['pdf', 'PDF'], ['word', 'Word'], ['excel', 'Excel'], ['powerpoint', 'PowerPoint'], ['image', 'Imágenes'], ['text', 'Texto'],
];
const LIST_LIMIT = 250;

export function parseRange(spec, total) {
  if (!spec || !spec.trim()) return Array.from({ length: total }, (_, i) => i);
  const out = [];
  for (const raw of spec.split(/[,;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    if (m) {
      const a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : total;
      if (a < 1 || b < 1 || a > total || b > total) return null;
      for (let p = a; a <= b ? p <= b : p >= b; p += a <= b ? 1 : -1) out.push(p - 1);
    } else if (/^\d+$/.test(part) && +part >= 1 && +part <= total) out.push(+part - 1);
    else return null;
  }
  return out.length ? out : null;
}

const OFFICE_KINDS = new Set(['word', 'excel', 'powerpoint']);

export function mountHome(root, app) {
  const { S, api } = app;

  // ---------- Buscador ----------
  const searchInput = h('input.field', { type: 'search', placeholder: 'Buscar por nombre o carpeta…', value: S.query, 'aria-label': 'Buscar documentos' });
  const chips = h('div.chips', { role: 'group', 'aria-label': 'Tipo de documento' }, FILTERS.map(([k, label]) =>
    h('button.chip', { 'aria-pressed': String(S.kindFilter === k), onclick: () => { S.kindFilter = k; renderChips(); renderList(); } }, label)));
  const countEl = h('span.count');
  const listEl = h('div.file-list', { role: 'listbox', 'aria-label': 'Documentos encontrados' });
  const scanStatus = h('div.scan-status');
  const finder = h('section.pane.finder',
    h('div.finder-head',
      h('div.finder-title', h('h2.h-pane', 'Documentos'), countEl),
      h('div.search', icon('search'), searchInput),
      chips),
    listEl,
    h('div.finder-foot',
      h('button.btn.sm', { onclick: pick, style: { flex: '1' } }, icon('folderOpen', 'sm'), 'Abrir otro archivo…'),
      h('button.btn.sm.icon-only', { title: 'Buscar de nuevo', 'aria-label': 'Buscar de nuevo', onclick: () => app.rescan() }, icon('refresh', 'sm'))),
    h('div', { style: { padding: '0 18px 12px' } }, scanStatus));

  let qTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { S.query = searchInput.value; renderList(); }, 120);
  });

  function renderChips() {
    [...chips.children].forEach((c, i) => c.setAttribute('aria-pressed', String(FILTERS[i][0] === S.kindFilter)));
  }

  function filtered() {
    const q = S.query.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return S.files.filter((f) => {
      if (S.kindFilter !== 'all' && f.kind !== S.kindFilter) return false;
      if (!q) return true;
      const hay = (f._k ||= `${f.name} ${f.dir}`.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''));
      return q.split(/\s+/).every((w) => hay.includes(w));
    }).sort((a, b) => b.mtime - a.mtime);
  }

  function groupOf(ms) {
    const d = (Date.now() - ms) / 86400000;
    if (d < 1) return 'Hoy';
    if (d < 7) return 'Esta semana';
    if (d < 31) return 'Este mes';
    return 'Antes';
  }

  function renderList() {
    if (!S.files.length && S.scanning) {
      clear(listEl, Array.from({ length: 9 }, () => h('div.sk-row', h('div.skeleton.a'), h('div', h('div.skeleton.b'), h('div.skeleton.c')))));
      countEl.textContent = '';
      return;
    }
    const items = filtered();
    countEl.textContent = items.length ? plural(items.length, 'documento', 'documentos') : '';
    if (!items.length) {
      clear(listEl, h('div.list-note', S.query || S.kindFilter !== 'all'
        ? 'Nada coincide con la búsqueda. Prueba con otra palabra o elige «Todos».'
        : 'No encontré documentos en Escritorio, Documentos ni Descargas. Usa «Abrir otro archivo…».'));
      return;
    }
    const frag = document.createDocumentFragment();
    let group = null;
    for (const f of items.slice(0, LIST_LIMIT)) {
      const g = groupOf(f.mtime);
      if (g !== group) { group = g; frag.append(h('div.group-label', g)); }
      frag.append(h('button.file-row', {
        role: 'option',
        'aria-selected': String(S.selected?.path === f.path),
        title: f.path,
        onclick: () => select(f),
      }, badge(f.kind), h('span', { style: { minWidth: 0 } }, h('div.fname', f.name), h('div.fmeta', `${folderName(f.dir)} · ${relTime(f.mtime)}`))));
    }
    if (items.length > LIST_LIMIT) frag.append(h('div.list-note', `Mostrando los ${LIST_LIMIT} más recientes. Escribe para encontrar el resto.`));
    clear(listEl, frag);
  }

  function renderScanStatus() {
    clear(scanStatus, S.scanning
      ? [h('span.spinner'), `Buscando en tus carpetas… ${S.files.length || ''}`]
      : S.files.length ? [icon('check', 'sm'), 'Búsqueda terminada'] : []);
  }

  // ---------- Vista previa ----------
  const previewTitle = h('h2');
  const previewSub = h('div.sub');
  const modeSeg = h('div.segmented', { role: 'group', 'aria-label': 'Modo de vista' },
    h('button', { 'aria-pressed': String(S.previewMode === 'pages'), onclick: () => setMode('pages') }, icon('fileText', 'sm'), 'Páginas'),
    h('button', { 'aria-pressed': String(S.previewMode === 'sheets'), onclick: () => setMode('sheets') }, icon('flip', 'sm'), 'Hojas'));
  const previewBar = h('div.preview-bar', h('div.titles', previewTitle, previewSub), modeSeg);
  const previewBody = h('div.preview-body');
  const preview = h('section.pane.preview', previewBar, previewBody);

  function setMode(m) {
    S.previewMode = m;
    [...modeSeg.children].forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0 ? 'pages' : 'sheets') === m)));
    renderPreview();
  }

  let renderToken = 0;
  let assistCache = null; // { path, mode, el }
  async function renderPreview() {
    const token = ++renderToken;
    previewBar.style.visibility = S.selected ? 'visible' : 'hidden';
    if (!S.selected) {
      clear(previewBody, emptyState());
      return;
    }
    previewTitle.textContent = S.selected.name;
    if (S.preparing) {
      previewSub.textContent = S.selected.kind === 'pdf' ? 'Abriendo…' : 'Convirtiendo a PDF para imprimir…';
      clear(previewBody, h('div.empty', h('div.empty-inner', h('div.skeleton', { style: { width: '300px', height: '388px', borderRadius: '6px' } }),
        h('p', S.selected.kind === 'pdf' ? 'Abriendo el documento…' : `Convirtiendo «${S.selected.name}»… puede tardar unos segundos.`))));
      return;
    }
    const office = OFFICE_KINDS.has(S.selected.kind);
    const assistDone = (res) => { S.prepared = res; S.prepError = null; S.assistOpen = false; assistCache = null; renderPreview(); renderSummary(); };
    // El panel se reutiliza mientras sea el mismo archivo: si la pantalla se redibuja, no se pierde la espera
    const assist = (opts) => {
      if (assistCache?.path !== S.selected.path || assistCache.mode !== opts.mode) assistCache = { path: S.selected.path, mode: opts.mode, el: assistPanel(app, S.selected, opts) };
      return assistCache.el;
    };
    if (S.prepError) {
      previewSub.textContent = folderName(S.selected.dir);
      clear(previewBody, h('div.empty', h('div.empty-inner',
        h('div.note.warn', icon('alert'), h('div', h('strong', 'No puedo abrir este archivo'), h('p', S.prepError))),
        // Word, Excel o PowerPoint: se puede abrir en el programa de oficina que tenga la persona y exportar a PDF
        office ? assist({ mode: 'error', onDone: assistDone }) : null,
        h('button.btn', { class: office ? 'ghost sm' : '', onclick: () => select(S.selected, true) }, icon('refresh'), 'Intentar de nuevo'))));
      return;
    }
    if (S.assistOpen && office) {
      clear(previewBody, h('div.empty', h('div.empty-inner',
        assist({
          mode: 'other',
          title: 'Ábrelo en otro programa y expórtalo a PDF',
          onDone: assistDone,
          onCancel: () => { S.assistOpen = false; assistCache = null; renderPreview(); },
        }))));
      return;
    }
    const prep = S.prepared;
    if (!prep) return;
    previewSub.textContent = `${plural(prep.pages, 'página', 'páginas')} · ${folderName(S.selected.dir)}${prep.via !== 'original' && prep.via !== 'caché' ? ` · convertido con ${prep.via}` : ''}`;
    // Si la conversión no se parece al original, se puede exportar desde otro programa
    if (office) previewSub.append(' · ', h('button.linkish', { onclick: () => { S.assistOpen = true; renderPreview(); } }, '¿No se parece al original? Usar otro programa'));
    let doc;
    try { doc = await openPdf(prep.pdfPath); } catch (e) { S.prepError = e.message; return renderPreview(); }
    if (token !== renderToken) return;
    if (S.previewMode === 'pages') await renderPages(doc, token);
    else await renderSheets(doc, token);
  }

  async function renderPages(doc, token) {
    S.pageIdx = Math.min(S.pageIdx, doc.numPages - 1);
    const wrap = h('div.page-canvas-wrap');
    const thumbs = h('div.thumbs');
    const prev = h('button.btn.icon-only.page-nav.prev', { 'aria-label': 'Página anterior', onclick: () => go(-1) }, icon('chevronLeft'));
    const next = h('button.btn.icon-only.page-nav.next', { 'aria-label': 'Página siguiente', onclick: () => go(1) }, icon('chevronRight'));
    clear(previewBody, h('div.stage-page', wrap, thumbs));
    const box = previewBody.getBoundingClientRect();
    const maxW = Math.max(240, box.width - 160);
    const maxH = Math.max(260, box.height - 170);

    async function drawMain() {
      const c = await renderPage(doc, S.pageIdx + 1, maxW, maxH);
      if (token !== renderToken) return;
      clear(wrap, c, doc.numPages > 1 ? [prev, next] : null);
      prev.disabled = S.pageIdx === 0;
      next.disabled = S.pageIdx >= doc.numPages - 1;
      [...thumbs.children].forEach((t, i) => t.setAttribute('aria-current', String(i === S.pageIdx)));
    }
    function go(d) {
      const n = S.pageIdx + d;
      if (n < 0 || n >= doc.numPages) return;
      S.pageIdx = n;
      drawMain();
      thumbs.children[n]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
    previewBody.onkeydown = (e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    await drawMain();
    if (doc.numPages > 1) {
      for (let i = 0; i < Math.min(doc.numPages, 60); i++) {
        const t = h('button.thumb', { 'aria-label': `Página ${i + 1}`, 'aria-current': String(i === S.pageIdx), onclick: () => { S.pageIdx = i; drawMain(); } }, h('span', String(i + 1)));
        thumbs.append(t);
      }
      for (let i = 0; i < Math.min(doc.numPages, 60); i++) {
        if (token !== renderToken) return;
        const c = await renderPage(doc, i + 1, 64, 84);
        thumbs.children[i]?.prepend(c);
      }
    }
  }

  async function renderSheets(doc, token) {
    const pages = parseRange(S.range, doc.numPages) || [];
    const grid = h('div.sheets-grid');
    clear(previewBody, h('div', { style: { padding: '18px 24px 0' } },
      h('div.note.info', icon('info'), h('p', 'Así quedará cada hoja de una copia. Pasa el mouse o haz clic sobre una hoja para ver su reverso.'))), grid);
    const cards = [];
    for (let i = 0; i < pages.length; i += 2) {
      const front = pages[i], back = i + 1 < pages.length ? pages[i + 1] : null;
      const fFace = h('div.face', h('span.tag', `Pág. ${front + 1}`));
      const bFace = back === null ? h('div.face.rev.blank', 'Reverso en blanco') : h('div.face.rev', h('span.tag', `Pág. ${back + 1}`));
      const flipEl = h('button.flip', { 'aria-label': `Hoja ${i / 2 + 1}: frente página ${front + 1}, reverso ${back === null ? 'en blanco' : `página ${back + 1}`}`, onclick: () => flipEl.classList.toggle('back') },
        h('div.flip-inner', fFace, bFace));
      grid.append(h('div.sheet-card', flipEl, h('div.sheet-label', h('b', `Hoja ${i / 2 + 1}`), ` · ${front + 1}${back !== null ? ` / ${back + 1}` : ' / en blanco'}`)));
      cards.push([fFace, front, bFace, back]);
      if (cards.length >= 40) break;
    }
    for (const [fFace, front, bFace, back] of cards) {
      if (token !== renderToken) return;
      fFace.prepend(await renderPage(doc, front + 1, 200, 260));
      if (back !== null) bFace.prepend(await renderPage(doc, back + 1, 200, 260));
    }
  }

  function emptyState() {
    const demo = paper();
    demo.style.cssText = 'position:relative;left:auto;translate:none;width:180px;height:126px;margin:0 auto 12px;rotate:-4deg';
    return h('div.empty', h('div.empty-inner',
      demo,
      h('h2', 'Elige qué quieres imprimir'),
      h('p', 'Busca el documento en la lista de la izquierda o arrástralo a esta ventana. Acepta PDF, Word, Excel, PowerPoint, imágenes y texto.'),
      h('button.btn.primary', { onclick: pick }, icon('folderOpen'), 'Abrir un archivo')));
  }

  // ---------- Panel de impresión ----------
  const panelBody = h('div.panel-body');
  const panelFoot = h('div.panel-foot');
  const panel = h('section.pane.panel', h('div.preview-bar', h('div.titles', h('h2', 'Imprimir a doble cara'), h('div.sub', 'Copias, páginas e impresora'))), panelBody, panelFoot);

  const copiesInput = h('input', { type: 'number', min: '1', max: '999', value: String(S.copies), 'aria-label': 'Número de copias', inputmode: 'numeric' });
  const minusBtn = h('button', { 'aria-label': 'Una copia menos', onclick: () => setCopies(S.copies - 1) }, icon('minus', 'lg'));
  const plusBtn = h('button', { 'aria-label': 'Una copia más', onclick: () => setCopies(S.copies + 1) }, icon('plus', 'lg'));
  copiesInput.addEventListener('input', () => setCopies(parseInt(copiesInput.value, 10) || 1, false));
  copiesInput.addEventListener('blur', () => (copiesInput.value = String(S.copies)));
  function setCopies(n, sync = true) {
    S.copies = Math.min(999, Math.max(1, n));
    if (sync) copiesInput.value = String(S.copies);
    minusBtn.disabled = S.copies <= 1;
    renderSummary();
  }

  const rangeInput = h('input.field', { placeholder: 'Ej.: 1-4, 7', value: S.range, 'aria-label': 'Páginas a imprimir' });
  const rangeHint = h('p.hint');
  rangeInput.addEventListener('input', () => { S.range = rangeInput.value; renderSummary(); if (S.previewMode === 'sheets') debounceSheets(); });
  let sheetsTimer;
  const debounceSheets = () => { clearTimeout(sheetsTimer); sheetsTimer = setTimeout(renderPreview, 400); };

  const printerSelect = h('select.field', { 'aria-label': 'Impresora', onchange: async () => { await app.setPrinter(printerSelect.value); renderPrinterBlock(); renderSummary(); } });
  const printerStatus = h('div.status-row');
  const summary = h('div');

  panelBody.append(
    h('div', h('label.label', 'Copias'), h('div.stepper', minusBtn, copiesInput, plusBtn),
      h('div.quick', [1, 2, 5, 10, 20].map((n) => h('button.chip', { onclick: () => setCopies(n) }, String(n))))),
    h('div', h('label.label', 'Páginas'), rangeInput, rangeHint),
    h('div', h('label.label', 'Impresora'), printerSelect, h('div', { style: { marginTop: '10px' } }, printerStatus)),
    summary);

  function renderPrinterBlock() {
    clear(printerSelect, S.printers.map((p) => h('option', { value: p.name, selected: p.name === S.printer }, p.displayName)));
    if (!S.printers.length) printerSelect.append(h('option', { value: '' }, 'No hay impresoras instaladas'));
    const prof = S.profile;
    clear(printerStatus,
      !S.printer ? h('span.pill.warn', icon('alert', 'sm'), 'Sin impresora')
        : prof?.calibrated ? h('span.pill.ok', icon('check', 'sm'), 'Calibrada') : h('span.pill.warn', icon('alert', 'sm'), 'Sin calibrar'),
      S.printer ? h('button.linkish', { onclick: () => app.go('printer') }, 'Ajustes de impresora') : null);
  }

  function renderSummary() {
    const prep = S.prepared;
    const total = prep?.pages || 0;
    const pages = total ? parseRange(S.range, total) : null;
    rangeHint.textContent = !total ? 'Vacío = todas las páginas.'
      : pages ? (S.range.trim() ? `${plural(pages.length, 'página elegida', 'páginas elegidas')} de ${total}.` : `Todas: ${plural(total, 'página', 'páginas')}.`)
        : `Revisa el rango: el documento tiene ${plural(total, 'página', 'páginas')}.`;
    rangeInput.style.borderColor = total && !pages ? 'var(--ambar)' : '';

    const prof = S.profile;
    let primary;
    if (!S.selected || !prep || !pages || !S.printer) {
      clear(summary);
      primary = h('button.btn.primary.big.block', { disabled: true }, icon('printer'), 'Imprimir a doble cara');
      clear(panelFoot, primary, h('p.hint', { style: { textAlign: 'center', margin: 0 } },
        !S.printer ? 'Conecta o instala una impresora para continuar.' : !S.selected ? 'Primero elige un documento.' : S.preparing ? 'Preparando el documento…' : 'Revisa el documento o el rango de páginas.'));
      return;
    }
    const perCopy = Math.ceil(pages.length / 2);
    const sheets = perCopy * S.copies;
    const cap = prof?.capacity || 100;
    const batches = Math.ceil(sheets / cap);
    const sec = sheets * 2 * (prof?.secPerSheet || 9) + batches * 30;
    clear(summary, h('div.ticket',
      h('div.big', h('strong', String(sheets)), h('span', sheets === 1 ? 'hoja de papel' : 'hojas de papel')),
      h('hr'),
      h('div.ticket-row', 'Por copia', h('b', `${plural(perCopy, 'hoja', 'hojas')} · ${plural(pages.length, 'página', 'páginas')}`)),
      h('div.ticket-row', 'Darás vuelta el mazo', h('b', batches === 1 ? '1 vez' : `${batches} veces (${batches} lotes)`)),
      h('div.ticket-row', 'Tiempo estimado', h('b', `~${duration(sec)}`)),
      pages.length % 2 ? h('div.ticket-row', 'Reverso en blanco', h('b', 'la última hoja de cada copia')) : null));

    const needsCal = !prof?.calibrated && !prof?.riskAccepted;
    clear(panelFoot,
      h('div.foot-summary',
        h('span', h('b', plural(sheets, 'hoja', 'hojas'))),
        h('span', 'vuelta al mazo ', h('b', batches === 1 ? '1 vez' : `${batches} veces`)),
        h('span', h('b', `~${duration(sec)}`))),
      needsCal ? h('div.note.warn', icon('alert'), h('div', h('strong', 'Calibra primero (2 hojas, 1 minuto)'), h('p', 'Así la app sabe cómo dar vuelta los reversos en tu impresora.'))) : null,
      needsCal
        ? h('button.btn.primary.big.block', { onclick: () => app.go('calibrate', { returnTo: 'home' }) }, icon('sparkles'), 'Calibrar impresora')
        : h('button.btn.primary.big.block', { onclick: startPrint }, icon('printer'), 'Imprimir a doble cara'),
      needsCal ? h('button.btn.ghost.block', { onclick: () => app.go('calibrate', { returnTo: 'home', skipFirst: true }) }, 'Imprimir sin calibrar…') : null,
      !needsCal && !prof?.calibrated ? h('p.hint', { style: { textAlign: 'center', margin: 0, color: 'var(--ambar-claro)' } }, 'Sin calibrar: aceptaste el riesgo de perder hojas.') : null);
  }

  function startPrint() {
    app.go('run', { job: { file: S.selected, pdfPath: S.prepared.pdfPath, copies: S.copies, range: S.range } });
  }

  // ---------- Acciones ----------
  async function select(f, force = false) {
    if (!force && S.selected?.path === f.path && (S.prepared || S.preparing)) return;
    S.selected = f;
    S.prepared = null;
    S.prepError = null;
    S.assistOpen = false;
    S.preparing = true;
    S.pageIdx = 0;
    renderList();
    renderPreview();
    renderSummary();
    try {
      const res = await api.prepare(f.path, { pageSize: S.profile?.paper && S.profile.paper !== 'auto' ? S.profile.paper : 'letter' });
      if (S.selected?.path !== f.path) return;
      S.prepared = res;
    } catch (e) {
      if (S.selected?.path !== f.path) return;
      S.prepError = e.message;
    } finally {
      if (S.selected?.path === f.path) S.preparing = false;
    }
    renderPreview();
    renderSummary();
  }

  async function pick() {
    const f = await api.pickFile();
    if (f) {
      if (!S.files.some((x) => x.path === f.path)) S.files.unshift(f);
      select(f);
    }
  }

  // Arrastrar y soltar en toda la ventana
  const overlay = h('div.drop-overlay', h('div.box', 'Suelta el archivo para imprimirlo'));
  document.body.append(overlay);
  let dragDepth = 0;
  const onEnter = (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; overlay.classList.add('on'); e.preventDefault(); } };
  const onLeave = () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) overlay.classList.remove('on'); };
  const onOver = (e) => e.preventDefault();
  const onDrop = (e) => {
    e.preventDefault();
    dragDepth = 0; overlay.classList.remove('on');
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const p = api.pathForFile(file);
    if (!p) return toast('No pude leer ese archivo.', 'warn');
    const name = p.split(/[\\/]/).pop();
    const dir = p.slice(0, p.length - name.length - 1);
    select({ path: p, name, dir, kind: app.kindOf(name), size: file.size, mtime: file.lastModified });
  };
  window.addEventListener('dragenter', onEnter);
  window.addEventListener('dragleave', onLeave);
  window.addEventListener('dragover', onOver);
  window.addEventListener('drop', onDrop);

  const el = h('div.home.view', finder, preview, panel);
  clear(root, el);
  renderChips(); renderList(); renderScanStatus(); renderPrinterBlock(); renderPreview(); setCopies(S.copies);
  if (S.selected && !S.prepared && !S.preparing) select(S.selected, true);

  return {
    onFiles() { renderList(); renderScanStatus(); },
    onPrinter() { renderPrinterBlock(); renderSummary(); },
    select,
    setMode,
    destroy() {
      overlay.remove();
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    },
  };
}
