// 朗讀（瀏覽器內建 SpeechSynthesis，離線、不連外）
let enabled = false;
try {
  enabled = localStorage.getItem("md.tts") === "on";
} catch (e) { /* ignore */ }

function synth() {
  return "speechSynthesis" in window ? window.speechSynthesis : null;
}

function zhVoice() {
  const s = synth();
  if (!s) return null;
  const vs = s.getVoices() || [];
  return vs.find((v) => /zh[-_]TW/i.test(v.lang))
    || vs.find((v) => /zh/i.test(v.lang))
    || null;
}

function strip(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent || "").replace(/\s+/g, " ").trim();
}

function speakNow(s, text) {
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = zhVoice();
    if (v) u.voice = v;
    u.lang = v ? v.lang : "zh-TW";
    u.rate = 0.85;
    u.pitch = 1.05;
    s.speak(u);
  } catch (e) { /* 某些瀏覽器需要使用者互動，忽略 */ }
}

let pending = null;

function unschedule() {
  if (pending) { clearTimeout(pending); pending = null; }
}

export const speech = {
  available() { return !!synth(); },
  get on() { return enabled && this.available(); },
  set on(v) {
    enabled = !!v;
    try { localStorage.setItem("md.tts", enabled ? "on" : "off"); } catch (e) { /* ignore */ }
    unschedule();
    if (!enabled) { const s = synth(); if (s) s.cancel(); }
  },
  // 步驟切換很快時，只朗讀最後停留的那一句，避免一直 cancel 重講
  say(html, immediate = false) {
    if (!this.on) return;
    const s = synth();
    if (!s) return;
    const text = strip(html);
    if (!text) return;
    unschedule();
    if (immediate) { speakNow(s, text); return; }
    pending = setTimeout(() => { pending = null; speakNow(s, text); }, 800);
  },
};
