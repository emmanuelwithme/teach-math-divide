import { MODES, MODE_ORDER, makeProblem, resolveCustom, breakdown } from "./division.js";
import { renderBoard, paintPhaseChips } from "./board.js";
import { renderStage, renderMove } from "./stage.js";
import { sfx } from "./sfx.js";
import { speech } from "./speech.js";

const qs = new URLSearchParams(location.search);
let mode = MODE_ORDER.includes(qs.get("mode")) ? qs.get("mode") : "int-int";
let level = Math.min(3, Math.max(1, Number(qs.get("level") || 2)));

const $ = (id) => document.getElementById(id);
const problemEl = $("problem");
const storyEl = $("storyText");
const boardEl = $("board");
const stageEl = $("stage");
const narrateEl = $("narrate");
const moveCard = $("moveCard");
const moveStage = $("moveStage");

let problem, plan, frames, f = 0, timer = null, showPlaces = false, model = "share";

function setProblem(p) {
  problem = p;
  plan = p.plan;
  model = (p.story && p.story.kind) || (mode === "int-dec" || mode === "dec-dec" ? "contain" : "share");
  frames = buildFrames(plan);
  f = 0;
  $("modePill").textContent = MODES[mode].label;
  $("modePill").style.setProperty("--mode-color", MODES[mode].color);
  document.title = `學一學｜${MODES[mode].label}`;
  $("playLink").href = `play.html?mode=${mode}&dividend=${encodeURIComponent(plan.dividendStr)}&divisor=${encodeURIComponent(plan.divisorStr)}`;
  problemEl.innerHTML =
    `<span class="num dividend">${plan.dividendStr}</span>` +
    `<span>÷</span><span class="num divisor">${plan.divisorStr}</span>` +
    `<span>=</span><span class="ans">?</span>`;
  storyEl.textContent = problem.story.text;
  $("story").querySelector(".emoji").textContent = problem.story.emoji;
  moveCard.classList.toggle("hidden", !plan.divisorIsDecimal);
  renderWhy();
  render();
}

function renderWhy() {
  const bd = breakdown(plan);
  const lines = bd.items.map((i) =>
    `<div class="why-line"><span><b>${plan.divisorStr}</b> × <b style="color:${i.color}">${i.part}</b> = <b>${i.product}</b></span>` +
    `<span class="muted small">← 商的${i.placeName}</span></div>`).join("");
  const sum = bd.items.map((i) => i.product).join(" + ") + (bd.remainder ? ` + ${bd.remainder}（餘數）` : "");
  $("whyBody").innerHTML =
    `<div class="small muted" style="margin-bottom:6px">直式是把被除數<b>拆成幾個好算的大塊</b>，一塊一塊分完，最後再合起來：</div>` +
    lines +
    `<div class="why-line total"><span>${sum} = <b>${bd.total}</b></span><span class="muted small">✓ 正好是被除數 ${plan.dividendStr}</span></div>` +
    `<div class="why-line"><span>所以 ${plan.dividendStr} ÷ ${plan.divisorStr} = ${bd.qParts.join(" + ")} = <b style="color:var(--ok)">${plan.quotientStr}</b>${bd.remainder ? ` 餘 ${bd.remainder}` : ""}</span></div>`;
}

function buildFrames(pl) {
  const out = [{ type: "intro" }];
  if (pl.divisorIsDecimal) out.push({ type: "move" });
  pl.cycles.forEach((c, i) => {
    out.push({ type: "take", c: i });
    out.push({ type: "quotient", c: i });
    out.push({ type: "multiply", c: i });
    out.push({ type: "subtract", c: i });
    if (c.bringDown) out.push({ type: "bringdown", c: i });
  });
  out.push({ type: "done" });
  return out;
}

function narrate(fr) {
  const g = plan.scaledDivisorStr;
  if (fr.type === "intro") {
    return { cls: "", html: `<span class="big">${problem.story.emoji} ${problem.story.text}</span><br>` +
      `<span class="muted">${problem.story.hint} 我們用直式一步一步算，左邊的方塊會跟你一起分。</span>` };
  }
  if (fr.type === "move") {
    return { cls: "", html: `<span class="big">除數 ${plan.divisorStr} 還有小數，先讓它變成整數。</span><br>` +
      `被除數和除數<b>同時</b>乘以 ${plan.factorLabel}（小數點一起向右搬 ${plan.factorExp} 位），<b style="color:var(--ok)">商不會變</b>！` };
  }
  if (fr.type === "done") {
    const rem = plan.remainderStr ? ` 餘 ${plan.remainderStr}` : "";
    return { cls: "good", html: `<span class="big">🎉 算完囉！${plan.dividendStr} ÷ ${plan.divisorStr} = <b style="color:var(--ok)">${plan.quotientStr}</b>${rem}</span><br>` +
      `<span class="muted">驗算：${plan.divisorStr} × ${plan.quotientStr}${plan.remainderStr ? " + " + plan.remainderStr : ""} = ${plan.checkStr}，和被除數一樣 ✓</span>` };
  }
  const c = plan.cycles[fr.c];
  if (fr.type === "take") {
    const lead = c.pendingBring
      ? `${c.pendingBring.digit} 不夠除以 ${g}，所以先看前面兩位：<b>${c.currentPart}</b>。`
      : "";
    if (c.currentPartUnits < Number(g)) {
      return { cls: "", html: `<span class="big">這一位只有 ${c.currentPart} 個${c.placeName}，比 ${g} 小，不夠分。</span><br>` +
        `<span class="muted">不夠分就在商的${c.placeName}寫 0，再落下下一位。</span>` };
    }
    if (model === "contain") {
      return { cls: "", html: `<span class="big">這一次有 <b style="color:${c.color}">${c.currentPart}</b> 個${c.placeName}，每 ${g} 個圈成一份。</span><br>` +
        `<span class="muted">${lead}想：${g} × 幾 <b>最接近</b> ${c.currentPart}，但是<b>不能超過</b>它？（也就是可以圈出幾份）</span>` };
    }
    return { cls: "", html: `<span class="big">這一次要分 <b style="color:${c.color}">${c.currentPart}</b> 個${c.placeName}，平均分給 ${g} 份。</span><br>` +
      `<span class="muted">${lead}想：${g} × 幾 <b>最接近</b> ${c.currentPart}，但是<b>不能超過</b>它？</span>` };
  }
  if (fr.type === "quotient") {
    if (c.q === 0) {
      return { cls: "", html: `<span class="big">② 商：不夠分 → 商的${c.placeName}寫 <b style="color:${c.color}">0</b></span>` };
    }
    const tail = model === "contain"
      ? `每 ${g} 個圈一份，圈得出 <b style="color:${c.color}">${c.q}</b> 份 → 商的${c.placeName}寫 ${c.q}`
      : `每份分到 ${c.q} 個 → 商的${c.placeName}寫 <b style="color:${c.color}">${c.q}</b>`;
    return { cls: "", html: `<span class="big">② 商：${g} × <b style="color:${c.color}">${c.q}</b> = ${c.product}，不超過 ${c.currentPart}；` +
      `但 ${g} × ${c.q + 1} = ${Number(g) * (c.q + 1)} 就超過了 ✓</span><br>` +
      `<span class="muted">看左邊：${tail}</span>` };
  }
  if (fr.type === "multiply") {
    return { cls: "", html: `<span class="big">③ 乘：${c.q} × ${g} = <b>${c.product}</b>，寫在 ${c.currentPart} 的下面，<b>位值要對齊</b>。</span>` };
  }
  if (fr.type === "subtract") {
    if (c.remainderUnits === 0) {
      return { cls: "good", html: `<span class="big">④ 減：${c.currentPart} − ${c.product} = <b style="color:var(--ok)">0</b>，這一輪剛好分完，沒有剩下！</span>` };
    }
    return { cls: "", html: `<span class="big">④ 減：${c.currentPart} − ${c.product} = <b style="color:var(--ok)">${c.remainder}</b></span><br>` +
      `<span class="muted">④ 比一比：剩下的 ${c.remainder} 比除數 ${g} 小 ✓ 代表這一位真的分完了。</span>` };
  }
  if (fr.type === "bringdown") {
    const next = plan.cycles[fr.c + 1];
    if (c.needDecimalPoint) {
      return { cls: "", html: `<span class="big">⑤ 落下：還有剩下，先在商的個位後面<b>點上小數點</b>，再<b>補 0</b> 繼續除。</span><br>` +
        `<span class="muted">補 0 之後變成 ${next ? next.currentPart : c.remainder + "0"}，繼續分。</span>` };
    }
    return { cls: "", html: `<span class="big">⑤ 落下：把下一位 <b>${c.bringDown.digit}</b>（${next ? next.placeName : ""}）拉下來，` +
      `變成 <b>${next ? next.currentPart : ""}</b>，繼續分。</span>` };
  }
  return { cls: "", html: "" };
}

function render() {
  const fr = frames[f];
  const phase = fr.type === "done" ? "done" : (["take", "quotient", "multiply", "subtract", "bringdown"].includes(fr.type) ? fr.type : "take");
  const active = fr.type === "done" ? plan.cycles.length : (fr.c ?? -1);

  renderBoard(boardEl, plan, {
    activeCycle: active,
    phase,
    showPlaces,
    showLegend: true,
  });

  if (fr.type === "intro" || fr.type === "move") {
    renderStage(stageEl, plan, null, "take", model);
  } else {
    renderStage(stageEl, plan, plan.cycles[fr.c], phase, model);
  }

  if (fr.type === "move") {
    moveCard.classList.remove("hidden");
    renderMove(moveStage, plan, true);
  } else if (plan.divisorIsDecimal) {
    renderMove(moveStage, plan, true);
  }

  const n = narrate(fr);
  narrateEl.className = "narrate " + n.cls;
  narrateEl.innerHTML = n.html;
  speech.say(n.html);

  paintPhaseChips(["take", "quotient", "multiply", "subtract", "bringdown"].includes(fr.type) ? fr.type : null);

  $("prevBtn").disabled = f === 0;
  $("nextBtn").disabled = f === frames.length - 1;
  $("nextBtn").textContent = f === frames.length - 1 ? "✓ 算完了" : "下一步 ➡";
}

function go(delta) {
  const nf = Math.min(frames.length - 1, Math.max(0, f + delta));
  if (nf === f) return;
  f = nf;
  sfx.tap();
  render();
}

function stopAuto() {
  if (timer) { clearInterval(timer); timer = null; $("autoBtn").textContent = "▶ 自動播放"; }
}
function startAuto() {
  stopAuto();
  $("autoBtn").textContent = "⏸ 暫停";
  timer = setInterval(() => {
    if (f >= frames.length - 1) { stopAuto(); return; }
    go(1);
  }, 2600);
}

$("nextBtn").addEventListener("click", () => { stopAuto(); go(1); });
$("prevBtn").addEventListener("click", () => { stopAuto(); go(-1); });
$("autoBtn").addEventListener("click", () => { timer ? stopAuto() : startAuto(); });
$("restartBtn").addEventListener("click", () => { stopAuto(); f = 0; render(); });
$("replayMove").addEventListener("click", () => {
  renderMove(moveStage, plan, false);
  setTimeout(() => renderMove(moveStage, plan, true), 500);
});
$("placeBtn").addEventListener("click", () => {
  showPlaces = !showPlaces;
  $("placeBtn").textContent = showPlaces ? "🏷 位值標記：開" : "🏷 位值標記：關";
  render();
});
$("newBtn").addEventListener("click", () => {
  stopAuto();
  setProblem(makeProblem(mode, level));
});

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "ArrowRight") { stopAuto(); go(1); }
  if (e.key === "ArrowLeft") { stopAuto(); go(-1); }
  if (e.key === " ") { e.preventDefault(); timer ? stopAuto() : startAuto(); }
});

$("goBtn").addEventListener("click", () => {
  const a = $("inDividend").value.trim();
  const b = $("inDivisor").value.trim();
  try {
    const p = resolveCustom(a, b);
    stopAuto();
    mode = p.mode;
    setProblem(p);
    $("teacherMsg").textContent = "✓ 已載入";
    history.replaceState(null, "", `learn.html?mode=${mode}&dividend=${encodeURIComponent(p.dividend)}&divisor=${encodeURIComponent(p.divisor)}`);
  } catch (err) {
    $("teacherMsg").textContent = "✗ " + err.message;
    sfx.bad();
  }
});

const sfxBtn = $("sfxBtn");
function paintSfx() { sfxBtn.textContent = sfx.on ? "🔊 音效：開" : "🔇 音效：關"; }
paintSfx();
sfxBtn.addEventListener("click", () => { sfx.on = !sfx.on; paintSfx(); if (sfx.on) sfx.good(); });

const ttsBtn = $("ttsBtn");
function paintTts() {
  if (!speech.available()) { ttsBtn.classList.add("hidden"); return; }
  ttsBtn.textContent = speech.on ? "🗣 朗讀：開" : "🗣 朗讀：關";
}
paintTts();
ttsBtn.addEventListener("click", () => {
  speech.on = !speech.on;
  paintTts();
  if (speech.on) speech.say(narrateEl.innerHTML);
});

// 啟動
window.__md = {
  get state() { return { mode, level, frame: f, total: frames.length, problem, plan, showPlaces }; },
  next() { stopAuto(); go(1); },
  prev() { stopAuto(); go(-1); },
  to(n) { stopAuto(); f = Math.min(frames.length - 1, Math.max(0, n)); render(); },
  load(a, b) { $("inDividend").value = a; $("inDivisor").value = b; $("goBtn").click(); },
  random(m, lv) { if (m) mode = m; if (lv) level = lv; setProblem(makeProblem(mode, level)); },
};

(function boot() {
  const a = qs.get("dividend"), b = qs.get("divisor");
  if (a && b) {
    try {
      const p = resolveCustom(a, b);
      mode = p.mode;
      setProblem(p);
      return;
    } catch (e) { /* 退回隨機題 */ }
  }
  setProblem(makeProblem(mode, level));
})();
