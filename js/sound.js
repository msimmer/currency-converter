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

// A soft, low "tock" like the iOS keyboard: a damped ~950 Hz knock with a
// muffled noise transient, eased in so the onset isn't sharp.
function makeClick(context) {
  const rate = context.sampleRate;
  const buf = context.createBuffer(1, Math.round(rate * 0.03), rate);
  const data = buf.getChannelData(0);
  const smoothing = 1 - Math.exp((-2 * Math.PI * 1200) / rate); // ~1.2 kHz low-pass
  let noise = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    noise += smoothing * ((Math.random() * 2 - 1) - noise);
    const knock = Math.sin(2 * Math.PI * 950 * t) * Math.exp(-t / 0.006);
    const transient = noise * Math.exp(-t / 0.0015);
    const attack = Math.min(1, t / 0.0005);
    data[i] = attack * (0.8 * knock + 0.6 * transient) * 0.12;
  }
  return buf;
}
