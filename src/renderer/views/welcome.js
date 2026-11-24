// Primer inicio: elegir guía por voz y sonidos, y luego el tour.
import { h, icon, clear } from '../ui.js';
import { say, play, configure, stopVoice } from '../audio.js';
import { MARK } from '../brand.js';

function toggle(label, desc, ic, on, onChange, preview) {
  const sw = h('span.switch', { role: 'switch', 'aria-checked': String(on) }, h('span.knob'));
  const card = h('div.opt-card', { class: on ? 'on' : '' },
    h('span.opt-ic', icon(ic, 'lg')),
    h('span.opt-text', h('b', label), h('span', desc)),
    h('div.opt-side',
      h('button.btn.ghost.sm', { onclick: (e) => { e.stopPropagation(); preview(); } }, icon('play', 'sm'), 'Probar'),
      sw));
  card.addEventListener('click', () => {
    on = !on;
    card.classList.toggle('on', on);
    sw.setAttribute('aria-checked', String(on));
    onChange(on);
  });
  card.tabIndex = 0;
  card.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); card.click(); } });
  return card;
}

export function mountWelcome(root, app) {
  const s = app.S.settings;
  let voice = s.voice !== false;
  let sounds = s.sounds !== false;
  configure({ voice, sounds });

  const voiceCard = toggle('Guía por voz', 'Te voy diciendo qué hacer en cada paso, para que no tengas que leer mientras manejas el papel.', 'volumeOn', voice,
    (v) => { voice = v; configure({ voice }); if (v) say('voz-activada'); else stopVoice(); }, () => say('voz-activada', { force: true }));
  const soundCard = toggle('Sonidos', 'Un sonido suave al avanzar, cuando te toca actuar y cuando algo termina.', 'bell', sounds,
    (v) => { sounds = v; configure({ sounds }); if (v) play('exito'); }, () => { configure({ sounds: true }); play('logro'); configure({ sounds }); });

  async function finish(withTour) {
    stopVoice();
    play('paso');
    app.S.settings = await app.api.setSettings({ voice, sounds });
    app.applySettings();
    app.go('home');
    if (withTour) app.startTour({ firstRun: true });
    else app.afterOnboarding();
  }

  const el = h('div.welcome.view',
    h('div.welcome-card',
      h('span.welcome-mark', { html: MARK }),
      h('h1', 'Te damos la bienvenida a Duplex Assistant'),
      h('p.lead', 'Imprime por los dos lados de la hoja aunque tu impresora no lo haga sola: la app ordena las páginas y te avisa cuándo dar vuelta el mazo.'),
      h('div.opts', voiceCard, soundCard),
      h('p.hint', 'Puedes cambiar esto cuando quieras con los botones Voz y Sonidos, arriba a la derecha.'),
      h('div.stage-actions.center',
        h('button.btn.primary.big', { onclick: () => finish(true) }, icon('sparkles'), 'Empezar el recorrido'),
        h('button.btn.ghost', { onclick: () => finish(false) }, 'Saltar el recorrido')),
      h('p.welcome-made', 'Desarrollado por SafeTech')));
  clear(root, el);
  setTimeout(() => say('bienvenida'), 450);
  return { destroy() { stopVoice(); } };
}
