// Keypad click sound, synthesized so there's nothing to download.
//
// iOS only lets audio start from a tap, so unlockAudio() runs on taps (the one
// that opens the keypad, and taps on the keypad itself); after that, clicks can
// play on touch-down. The 'ambient' audio session follows the silent switch and
// plays over music instead of pausing it, like the system keyboard.

let ctx = null;
let buffer = null;

export function unlockAudio() {
  try {
    if (!ctx) {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return;
      ctx = new AudioContext();
      buffer = makeClick(ctx);
    }
    // iOS suspends ('interrupted') the context when the app goes to the background.
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  } catch {
    // No audio; the keypad works silently.
  }
}

export function playClick() {
  if (ctx?.state !== 'running') return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
}

// A short, soft tick: a bright tone plus a little noise, gone in ~12ms.
function makeClick(context) {
  const rate = context.sampleRate;
  const buf = context.createBuffer(1, Math.round(rate * 0.012), rate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    const tone = Math.sin(2 * Math.PI * 3200 * t) * 0.6;
    const noise = (Math.random() * 2 - 1) * 0.4;
    data[i] = (tone + noise) * Math.exp(-t * 600) * 0.35;
  }
  return buf;
}
