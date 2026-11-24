// Guía por voz (frases grabadas con ElevenLabs) y sonidos de interfaz, cada uno con su interruptor.
const VOICE_DIR = './voz/';
const SOUND_DIR = './sonidos/';

// Sonidos SafeTech + un «paso» sintetizado suave para avanzar.
const SOUND_FILES = { aviso: 'aviso.wav', error: 'error.wav', exito: 'exito.wav', logro: 'logro.wav' };

const state = { voice: true, sounds: true };
const listeners = new Set();
let current = null;   // Audio de la voz en curso
let ctx = null;       // AudioContext para el «paso»

export function configure({ voice, sounds }) {
  if (typeof voice === 'boolean') state.voice = voice;
  if (typeof sounds === 'boolean') state.sounds = sounds;
  if (!state.voice) stopVoice();
  listeners.forEach((fn) => fn({ ...state }));
}

export const audioState = () => ({ ...state });
export const onAudioChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function stopVoice() {
  if (current) { current.pause(); current.src = ''; current = null; }
}

/** Dice una frase de la guía (id del guion). Corta la anterior. force: suena aunque la voz esté apagada (vista previa). */
export function say(id, { force = false } = {}) {
  if (window.__daMute) { lastSaid = id; return null; } // autoprueba: registra la frase sin sonar
  if (!id || (!state.voice && !force)) return null;
  stopVoice();
  const a = new Audio(`${VOICE_DIR}${id}.mp3`);
  a.volume = 1;
  current = a;
  a.addEventListener('ended', () => { if (current === a) current = null; });
  a.play().catch(() => { /* archivo faltante o reproducción bloqueada: la guía escrita sigue en pantalla */ });
  return a;
}

let lastSaid = null;
export const lastVoice = () => lastSaid;

const cache = {};
/** Sonido de interfaz: 'paso' | 'aviso' | 'error' | 'exito' | 'logro'. */
export function play(name) {
  if (window.__daMute || !state.sounds) return;
  const ducked = current && !current.paused ? 0.35 : 1;
  if (name === 'paso') return tick(ducked);
  const file = SOUND_FILES[name];
  if (!file) return;
  const base = (cache[name] ||= new Audio(`${SOUND_DIR}${file}`));
  const a = base.cloneNode();
  a.volume = 0.55 * ducked;
  a.play().catch(() => {});
}

// Dos notas cortas y suaves (sol-do), para «avanzar».
function tick(gain = 1) {
  try {
    ctx ||= new AudioContext();
    const t = ctx.currentTime;
    [[784, 0], [1047, 0.07]].forEach(([f, d]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.16 * gain, t + d + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t + d);
      o.stop(t + d + 0.25);
    });
  } catch { /* sin audio */ }
}
