import { MODES, MODE_ORDER, makeProblem, resolveCustom } from "./division.js";
import { renderBoard, paintPhaseChips } from "./board.js";
import { renderStage, renderMove } from "./stage.js";
import { sfx } from "./sfx.js";
import { speech } from "./speech.js";
import { store, starText, roundRating } from "./store.js";

const ROUND_LEN = 5;
const qs = new URLSearchParams(location.search);
let mode = MODE_ORDER.includes(qs.get("mode")) ? qs.get("mode") : "int-int";
let level = Math.min(3, Math.max(1, Number(qs.get("level") || 2)));

const $ = (id) => document.getElementById(id);
const boardEl = $("board");
const stageEl = $("stage");
const narrateEl = $("narrate");
const keypadEl = $("keypad");

let questions = [], qi = 0, plan = null, problem = null;
let state = "idle"; // move | askDigit | animating | needBringDown | qDone | roundDone
let cycleIdx = 0, phase = "take", attempts = 0, hintsUsed = 0, model = "share";
let timers = [];

// 換題／換輪次時要能把還沒跑完的動畫計時器全部清掉，否則會蓋到下一題
function later(fn, ms) {
  const t = setTimeout(() => {
    timers = timers.filter((x) => x !== t);
    fn();
  }, ms);
  timers.push(t);
  return t;
}
function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

/* ---------------- 鍵盤 ---------------- */
for (let d = 0; d <= 9; d++) {
  const b = document.createElement("button");
  b.className = "key";
  b.textContent = d;
  b.dataset.d = d;
  b.addEventListener("click", () => answer(d, b));
  keypadEl.appendChild(b);
}
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (/^[0-9]$/.test(e.key)) {
    const btn = keypadEl.querySelector(`[data-d="${e.key}"]`);
    if (btn && !btn.disabled) answer(Number(e.key), btn);
  }
});

function setKeypadEnabled(on) {
  keypadEl.querySelectorAll(".key").forEach((k) => { k.disabled = !on; k.classList.remove("wrong"); });
}

/* ---------------- 流程 ---------------- */
function startRound(custom) {
  clearTimers();
  $("resultCard").classList.add("hidden");
  questions = [];
  for (let i = 0; i < ROUND_LEN; i++) {
    questions.push(custom ? { ...custom, plan: custom.plan } : makeProblem(mode, level));
  }
  qi = 0;
  loadQuestion();
}

function loadQuestion() {
  clearTimers();
  problem = questions[qi];
  plan = problem.plan;
  model = (problem.story && problem.story.kind) || (mode === "int-dec" || mode === "dec-dec" ? "contain" : "share");
  attempts = 0; hintsUsed = 0; cycleIdx = 0; phase = "take";
  paintPhaseChips(null);
  $("nextStepBtn").onclick = null;
  $("modePill").textContent = MODES[mode].label;
  $("modePill").style.setProperty("--mode-color", MODES[mode].color);
  $("learnLink").href = `learn.html?mode=${mode}&dividend=${encodeURIComponent(plan.dividendStr)}&divisor=${encodeURIComponent(plan.divisorStr)}`;
  $("problem").innerHTML =
    `<span class="num dividend">${plan.dividendStr}</span><span>÷</span>` +
    `<span class="num divisor">${plan.divisorStr}</span><span>=</span><span class="ans">?</span>`;
  $("storyText").textContent = problem.story.text;
  $("story").querySelector(".emoji").textContent = problem.story.emoji;
  $("mult").classList.add("hidden");
  $("nextQBtn").classList.add("hidden");
  $("skipBtn").classList.add("hidden");
  $("nextStepBtn").classList.add("hidden");
  renderProgress();

  if (plan.divisorIsDecimal) {
    state = "move";
    $("moveCard").classList.remove("hidden");
    renderMove(moveStageEl(), plan, false);
    buildMoveChoices();
    setMoveMsg("除數還有小數。要同時乘以幾，除數才會變成整數？", "");
    setMsg(`${problem.story.emoji} ${problem.story.hint}`, "");
    setKeypadEnabled(false);
    renderBoard(boardEl, plan, { activeCycle: -1, phase: "take", showLegend: true });
    renderStage(stageEl, plan, null, "take", model);
  } else {
    $("moveCard").classList.add("hidden");
    state = "askDigit";
    renderBoard(boardEl, plan, { activeCycle: 0, phase: "take", hideAnswer: true, showLegend: true });
    renderStage(stageEl, plan, plan.cycles[0], "take", model);
    setMsg(askText(plan.cycles[0]), "");
    setKeypadEnabled(true);
    $("skipBtn").classList.remove("hidden");
  }
}

const moveStageEl = () => $("moveStage");

function buildMoveChoices() {
  const box = $("moveChoices");
  box.innerHTML = "";
  const opts = new Set([plan.factorExp]);
  opts.add(plan.factorExp === 1 ? 2 : 1);
  if (opts.size < 3) opts.add(3);
  [...opts].sort(() => Math.random() - 0.5).forEach((k) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = `同時 × ${"1" + "0".repeat(k)}`;
    b.addEventListener("click", () => chooseFactor(k, b));
    box.appendChild(b);
  });
}

function chooseFactor(k, btn) {
  if (state !== "move") return;
  if (k !== plan.factorExp) {
    sfx.bad();
    btn.classList.add("wrong");
    later(() => btn.classList.remove("wrong"), 450);
    const want = Number(plan.scaledDivisorStr);
    setMoveMsg(`再想想：${plan.divisorStr} 要變成整數 ${want}，小數點要向右搬 ${plan.factorExp} 位，所以要乘 ${"1" + "0".repeat(plan.factorExp)}。`, "oops");
    return;
  }
  sfx.good();
  renderMove(moveStageEl(), plan, true);
  $("moveChoices").innerHTML = "";
  setMoveMsg(`✓ 對了！${plan.dividendStr} ÷ ${plan.divisorStr} 變成 <b>${plan.scaledDividendStr} ÷ ${plan.scaledDivisorStr}</b>，商不會變。`, "good");
  later(() => {
    state = "askDigit";
    cycleIdx = 0;
    renderBoard(boardEl, plan, { activeCycle: 0, phase: "take", hideAnswer: true, showLegend: true });
    renderStage(stageEl, plan, plan.cycles[0], "take", model);
    setMsg(askText(plan.cycles[0]), "");
    setKeypadEnabled(true);
    $("skipBtn").classList.remove("hidden");
  }, 1500);
}

function askText(c) {
  const g = plan.scaledDivisorStr;
  if (c.currentPartUnits < Number(g)) {
    return `這一位 ${c.currentPart} 比 ${g} 小，不夠分。商的${c.placeName}要寫幾？`;
  }
  if (model === "contain") {
    return `第 ${c.index + 1} 步：${c.currentPart} 個${c.placeName}，每 ${g} 個圈成一份，可以圈幾份？（商的${c.placeName}是幾）`;
  }
  return `第 ${c.index + 1} 步：${g} × 幾 最接近 ${c.currentPart}，但不能超過它？（商的${c.placeName}是幾）`;
}

function answer(d, btn) {
  if (state !== "askDigit") return;
  const c = plan.cycles[cycleIdx];
  if (d === c.q) {
    sfx.good();
    state = "animating";
    setKeypadEnabled(false);
    $("skipBtn").classList.add("hidden");
    runReveal(c);
  } else {
    attempts++;
    sfx.bad();
    btn.classList.add("wrong");
    later(() => btn.classList.remove("wrong"), 450);
    const g = Number(plan.scaledDivisorStr);
    const cur = Number(c.currentPart);
    let msg;
    if (d > c.q) {
      msg = `${g} × ${d} = ${g * d}，超過 ${cur} 了 ⚠ 換小一點的數試試。`;
    } else {
      const up = g * (d + 1);
      msg = up > cur
        ? `${g} × ${d} = ${g * d} 沒有超過 ${cur}，可是 ${g} × ${d + 1} = ${up} 就超過了 → 答案是 ${d + 1} 喔！`
        : `${g} × ${d} = ${g * d}，還可以更大：${g} × ${d + 1} = ${up} 也沒有超過 ${cur}，再大一點！`;
    }
    setMsg(msg, "oops");
  }
}

function runReveal(c) {
  const steps = [
    ["quotient", 700],
    ["multiply", 800],
    ["subtract", 900],
  ];
  let i = 0;
  const tick = () => {
    if (i >= steps.length) {
      afterSubtract(c);
      return;
    }
    const [p, wait] = steps[i++];
    phase = p;
    paint(c, p);
    later(tick, wait);
  };
  tick();
}

function paint(c, p) {
  renderBoard(boardEl, plan, { activeCycle: cycleIdx, phase: p, showLegend: true });
  renderStage(stageEl, plan, c, p, model);
  paintPhaseChips(p);
  const g = plan.scaledDivisorStr;
  if (p === "quotient") setMsg(`✓ 商的${c.placeName}是 ${c.q}（${g} × ${c.q} = ${c.product}，不超過 ${c.currentPart}）`, "good");
  if (p === "multiply") setMsg(`${c.q} × ${g} = ${c.product}，寫下來，位值對齊。`, "");
  if (p === "subtract") {
    setMsg(c.remainderUnits === 0
      ? `${c.currentPart} − ${c.product} = 0，剛好分完！`
      : `${c.currentPart} − ${c.product} = ${c.remainder}，${c.remainder} 比 ${g} 小 ✓`, "good");
  }
}

function afterSubtract(c) {
  if (c.bringDown) {
    state = "needBringDown";
    const btn = $("nextStepBtn");
    btn.classList.remove("hidden");
    btn.textContent = c.needDecimalPoint ? "⬇ 點小數點、補 0 繼續" : "⬇ 落下下一位";
    btn.onclick = () => {
      btn.classList.add("hidden");
      sfx.tap();
      phase = "bringdown";
      paint(c, "bringdown");
      later(() => {
        cycleIdx++;
        if (cycleIdx >= plan.cycles.length) { finishQuestion(); return; }
        const nc = plan.cycles[cycleIdx];
        state = "askDigit";
        renderBoard(boardEl, plan, { activeCycle: cycleIdx, phase: "take", hideAnswer: true, showLegend: true });
        renderStage(stageEl, plan, nc, "take", model);
        setMsg(askText(nc), "");
        setKeypadEnabled(true);
        $("skipBtn").classList.remove("hidden");
      }, 900);
    };
  } else {
    later(finishQuestion, 500);
  }
}

$("skipBtn").addEventListener("click", () => {
  if (state !== "askDigit") return;
  hintsUsed += 2;
  const c = plan.cycles[cycleIdx];
  setKeypadEnabled(false);
  $("skipBtn").classList.add("hidden");
  setMsg(`這一題的商是 ${plan.quotientStr}${plan.remainderStr ? " 餘 " + plan.remainderStr : ""}，跟著看一遍：${c.placeName}寫 ${c.q}`, "");
  state = "animating";
  runReveal(c);
});

$("hintBtn").addEventListener("click", () => {
  if (state !== "askDigit") return;
  hintsUsed++;
  const c = plan.cycles[cycleIdx];
  const g = Number(plan.scaledDivisorStr);
  const box = $("mult");
  box.classList.remove("hidden");
  box.innerHTML = "";
  for (let i = 1; i <= 9; i++) {
    const v = g * i;
    const d = document.createElement("div");
    d.textContent = `${g}×${i}=${v}`;
    if (i === c.q) d.classList.add("hit");
    if (v > Number(c.currentPart)) d.classList.add("over");
    box.appendChild(d);
  }
  sfx.tap();
});

function finishQuestion() {
  state = "qDone";
  phase = "done";
  paintPhaseChips(null);
  setKeypadEnabled(false);
  $("nextStepBtn").classList.add("hidden");
  $("skipBtn").classList.add("hidden");
  renderBoard(boardEl, plan, { activeCycle: plan.cycles.length, phase: "done", showLegend: true });
  renderStage(stageEl, plan, plan.cycles[plan.cycles.length - 1], "done", model);
  const rem = plan.remainderStr ? ` 餘 ${plan.remainderStr}` : "";
  const stars = Math.max(1, 3 - Math.min(2, attempts + hintsUsed));
  problem.stars = stars;
  problem.attempts = attempts;
  problem.hints = hintsUsed;
  problem.done = true;
  sfx.great();
  setMsg(`🎉 ${plan.dividendStr} ÷ ${plan.divisorStr} = <b style="color:var(--ok)">${plan.quotientStr}</b>${rem}　${starText(stars)}<br>` +
    `<span class="muted">驗算：${plan.divisorStr} × ${plan.quotientStr}${plan.remainderStr ? " + " + plan.remainderStr : ""} = ${plan.checkStr}</span>`, "good");
  $("problem").innerHTML =
    `<span class="num dividend">${plan.dividendStr}</span><span>÷</span>` +
    `<span class="num divisor">${plan.divisorStr}</span><span>=</span>` +
    `<span class="ans">${plan.quotientStr}${rem}</span>`;
  renderProgress();
  const btn = $("nextQBtn");
  btn.classList.remove("hidden");
  btn.textContent = qi >= ROUND_LEN - 1 ? "🏁 看成績" : "下一題 ➡";
}

$("nextQBtn").addEventListener("click", () => {
  qi++;
  if (qi >= ROUND_LEN) { finishRound(); return; }
  loadQuestion();
});

function renderProgress() {
  const box = $("progress");
  box.innerHTML = "";
  for (let i = 0; i < ROUND_LEN; i++) {
    const d = document.createElement("div");
    d.className = "qdot" + (questions[i] && questions[i].done ? " done" : "") + (i === qi ? " now" : "");
    d.textContent = questions[i] && questions[i].done ? "★" : i + 1;
    box.appendChild(d);
  }
}

function finishRound() {
  state = "roundDone";
  const correct = questions.filter((q) => (q.stars || 0) >= 2).length;
  const stars = questions.reduce((s, q) => s + (q.stars || 0), 0);
  store.addRound(mode, stars, correct, ROUND_LEN);
  $("moveCard").classList.add("hidden");
  $("resultCard").classList.remove("hidden");
  $("nextQBtn").classList.add("hidden");
  $("resultBody").innerHTML =
    `<div class="stars">${starText(roundRating(stars, ROUND_LEN))}</div>` +
    `<div style="font-size:1.4rem;font-weight:800">得到 ${stars} 顆星（滿分 ${ROUND_LEN * 3}）</div>` +
    `<div class="muted">${MODES[mode].label}｜累計 ${store.get(mode).stars} 顆星，玩過 ${store.get(mode).rounds} 輪</div>` +
    `<div class="center" style="margin-top:10px">${questions.map((q) =>
      `<div>${q.plan.dividendStr} ÷ ${q.plan.divisorStr} = <b>${q.plan.quotientStr}</b>${q.plan.remainderStr ? " 餘 " + q.plan.remainderStr : ""} <span class="stars">${starText(q.stars || 0)}</span></div>`).join("")}</div>`;
  sfx.win();
  confetti();
  $("resultCard").scrollIntoView({ behavior: "smooth", block: "center" });
}

function confetti() {
  const box = $("confetti");
  box.innerHTML = "";
  const colors = ["#2a6df4", "#12996b", "#e07a3f", "#b5179e", "#f2a007"];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
    c.style.animationDelay = Math.random() * 0.8 + "s";
    box.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

function setMsg(html, cls) {
  narrateEl.className = "narrate " + (cls || "");
  narrateEl.innerHTML = html;
  speech.say(html);
}

function setMoveMsg(html, cls) {
  const el = $("moveMsg");
  el.className = "narrate " + (cls || "");
  el.innerHTML = html;
}

/* ---------------- 選單 ---------------- */
function paintLevel() {
  $("levelSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.lv) === level));
}
$("levelSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  level = Number(b.dataset.lv);
  paintLevel();
  startRound();
});
$("againBtn").addEventListener("click", () => startRound());
$("homeBtn").addEventListener("click", () => { location.href = "index.html"; });

$("goBtn").addEventListener("click", () => {
  const a = $("inDividend").value.trim();
  const b = $("inDivisor").value.trim();
  try {
    const p = resolveCustom(a, b);
    mode = p.mode;
    $("teacherMsg").textContent = "✓";
    startRound(p);
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
ttsBtn.addEventListener("click", () => { speech.on = !speech.on; paintTts(); if (speech.on) speech.say(narrateEl.innerHTML); });

paintLevel();
(function boot() {
  const a = qs.get("dividend"), b = qs.get("divisor");
  if (a && b) {
    try {
      const p = resolveCustom(a, b);
      mode = p.mode;
      startRound(p);
      return;
    } catch (e) { /* 退回隨機題 */ }
  }
  startRound();
})();

window.__md = {
  get state() {
    return { mode, level, qi, state, cycleIdx, phase, attempts, hintsUsed, plan,
      stars: questions.map((q) => q.stars || 0) };
  },
  answer(d) { answer(d, keypadEl.querySelector(`[data-d="${d}"]`) || document.createElement("button")); },
  chooseFactor(k) {
    const dummy = { classList: { add() {}, remove() {} } };
    chooseFactor(k ?? plan.factorExp, dummy);
  },
  bringDown() { const b = $("nextStepBtn"); if (!b.classList.contains("hidden")) b.click(); },
  nextQuestion() { $("nextQBtn").click(); },
  hint() { $("hintBtn").click(); },
  skip() { $("skipBtn").click(); },
  level(lv) { level = lv; paintLevel(); startRound(); },
  load(a, b) { $("inDividend").value = a; $("inDivisor").value = b; $("goBtn").click(); },
  solveAll() {
    // 自動把本題答對（供截圖/錄影用）
    return new Promise((resolve) => {
      const step = () => {
        const s = this.state.state;
        if (s === "move") { this.chooseFactor(this.state.plan.factorExp); setTimeout(step, 1700); return; }
        if (s === "askDigit") { this.answer(this.state.plan.cycles[this.state.cycleIdx].q); setTimeout(step, 2600); return; }
        if (s === "needBringDown") { this.bringDown(); setTimeout(step, 1200); return; }
        resolve(this.state);
      };
      step();
    });
  },
};
