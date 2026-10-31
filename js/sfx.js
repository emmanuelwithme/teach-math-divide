// 輕量音效（WebAudio，不需外部檔案）
let ctx = null;
let enabled = true;

try {
  enabled = localStorage.getItem("md.sfx") !== "off";
} catch (e) { /* ignore */ }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, t0, dur, type = "sine", gain = 0.16) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + t0);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + t0);
  o.stop(c.currentTime + t0 + dur + 0.02);
}

export const sfx = {
  get on() { return enabled; },
  set on(v) {
    enabled = !!v;
    try { localStorage.setItem("md.sfx", enabled ? "on" : "off"); } catch (e) { /* ignore */ }
  },
  tap() { if (enabled) tone(520, 0, 0.08, "triangle", 0.1); },
  good() {
    if (!enabled) return;
    tone(660, 0, 0.12, "sine", 0.14);
    tone(880, 0.1, 0.16, "sine", 0.14);
  },
  great() {
    if (!enabled) return;
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.22, "triangle", 0.13));
  },
  bad() {
    if (!enabled) return;
    tone(220, 0, 0.16, "sawtooth", 0.08);
    tone(180, 0.12, 0.2, "sawtooth", 0.07);
  },
  win() {
    if (!enabled) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.11, 0.3, "triangle", 0.12));
  },
};
