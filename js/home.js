import { MODES, MODE_ORDER } from "./division.js";
import { store, starText, roundRating } from "./store.js";
import { sfx } from "./sfx.js";

const EXAMPLE = {
  "int-int": ["84", "4", "21"],
  "dec-int": ["8.4", "4", "2.1"],
  "int-dec": ["84", "0.4", "210"],
  "dec-dec": ["8.4", "0.4", "21"],
};

const DESC = {
  "int-int": "先學會「商、乘、減、比、落下」五個動作",
  "dec-int": "分到有小的數量，商的個位後面要點小數點",
  "int-dec": "除數變成整數：小數點一起搬家",
  "dec-dec": "兩個都有小數，先搬家再直式",
};

const el = document.getElementById("modes");
MODE_ORDER.forEach((key) => {
  const m = MODES[key];
  const [a, b, q] = EXAMPLE[key];
  const st = store.get(key);
  const card = document.createElement("div");
  card.className = "mode-card";
  card.style.setProperty("--mode-color", m.color);
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <span class="emoji">${m.emoji}</span>
      <div>
        <div class="name">${m.label}</div>
        <div class="small muted">${DESC[key]}</div>
      </div>
    </div>
    <div class="example">${a} ÷ ${b} = <span style="color:#12996b">${q}</span></div>
    <div class="stars" title="累計星星">${starText(roundRating(st.stars, st.rounds * st.roundLen))}
      <span class="small muted" style="letter-spacing:0">共 ${st.stars} 顆 · 玩過 ${st.rounds} 輪</span>
    </div>
    <div class="btn-row">
      <button class="btn primary" data-go="learn">📖 學一學</button>
      <button class="btn" data-go="play">🎮 玩一玩</button>
    </div>`;
  card.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sfx.tap();
      location.href = `${btn.dataset.go}.html?mode=${key}`;
    });
  });
  el.appendChild(card);
});

const sfxBtn = document.getElementById("sfxBtn");
function paintSfx() { sfxBtn.textContent = sfx.on ? "🔊 音效：開" : "🔇 音效：關"; }
paintSfx();
sfxBtn.addEventListener("click", () => { sfx.on = !sfx.on; paintSfx(); if (sfx.on) sfx.good(); });

document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("確定要清除這台裝置上的學習進度嗎？")) return;
  store.reset();
  sfx.tap();
  location.reload();
});
