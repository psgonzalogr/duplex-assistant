// «Reportar un problema o sugerencia»: muestra el correo de SafeTech y arma un correo con los datos útiles.
import { h, icon, toast } from './ui.js';

export const SUPPORT_EMAIL = 'contacto@safe-tech.cl';

const OS = { win32: 'Windows', linux: 'Linux', darwin: 'macOS' };
const OUT = { 'up-in': 'boca arriba, parte de arriba hacia la impresora', 'up-out': 'boca arriba, parte de arriba hacia mí', down: 'boca abajo' };
const FEED = { bottom: 'papel por abajo', top: 'papel por arriba' };

/** Datos de la app y de la impresora para que SafeTech entienda el caso sin preguntar de vuelta. */
function details(app) {
  const { S } = app;
  const p = S.profile;
  const lines = [`Duplex Assistant v${S.info?.version || '?'} · ${OS[S.info?.platform] || S.info?.platform || '?'}`];
  if (S.printer) {
    const bits = [p?.calibrated ? 'calibrada' : 'sin calibrar'];
    if (p?.feed) bits.push(FEED[p.feed]);
    if (p?.outputFace) bits.push(`sale ${OUT[p.outputFace]}`);
    lines.push(`Impresora: ${S.printer} (${bits.join('; ')})`);
  }
  return lines.join('\n');
}

export function openFeedback(app) {
  document.querySelector('dialog.feedback')?.remove();
  const subject = 'Duplex Assistant: problema o sugerencia';
  const body = `Cuéntanos qué pasó o qué te gustaría mejorar (si puedes, adjunta una foto de las hojas):\n\n\n\n---\n${details(app)}\n`;
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const close = () => { dlg.close(); dlg.remove(); };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      toast('Correo copiado.');
    } catch {
      toast(`Copia este correo: ${SUPPORT_EMAIL}`, 'warn');
    }
  };

  const dlg = h('dialog.feedback', { 'aria-labelledby': 'fb-title' },
    h('button.btn.ghost.icon-only.sm.fb-close', { 'aria-label': 'Cerrar', onclick: close }, icon('x', 'sm')),
    h('h2', { id: 'fb-title' }, '¿Algo no funcionó o tienes una idea?'),
    h('p', 'Escríbenos a SafeTech. Cuéntanos qué pasó y qué impresora usas; si puedes, adjunta una foto de las hojas. También nos sirven tus sugerencias para mejorar la app.'),
    h('div.fb-mail', icon('mail'), h('span.fb-addr', { 'aria-label': 'Correo de SafeTech' }, SUPPORT_EMAIL)),
    h('div.fb-actions',
      h('button.btn.primary', { autofocus: true, onclick: () => { app.api.openExternal(mailto); close(); } }, icon('mail'), 'Escribir correo'),
      h('button.btn.ghost', { onclick: copy }, icon('copy'), 'Copiar correo')),
    h('p.hint', 'Al apretar «Escribir correo» se abre tu programa de correo con la versión de la app y los datos de tu impresora ya puestos.'));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}
