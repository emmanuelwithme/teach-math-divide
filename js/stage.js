// 視覺化：分方塊（等分除）/ 面積長條（包含除、除數較大時）

function tile(value, color, delay) {
  const s = document.createElement("span");
  s.className = "tile";
  s.style.setProperty("--c", color);
  s.style.animationDelay = `${Math.min(delay * 22, 500)}ms`;
  s.textContent = value;
  return s;
}

function tileRow(arr, value, color, cap = 60) {
  const box = document.createElement("div");
  box.className = "tiles";
  const n = Math.min(arr, cap);
  for (let i = 0; i < n; i++) box.appendChild(tile(value, color, i));
  if (arr > cap) {
    const more = document.createElement("span");
    more.className = "group-label";
    more.textContent = `×${arr}`;
    box.appendChild(more);
  }
  return box;
}

/**
 * @param {HTMLElement} el
 * @param {object} plan
 * @param {object|null} cycle  plan.cycles[i]，null = 尚未開始
 * @param {string} phase
 * @param {string} model  'share' 等分除（平均分給 N 份）| 'contain' 包含除（每 N 個一份）
 */
export function renderStage(el, plan, cycle, phase, model = "share") {
  const contain = model === "contain";
  el.innerHTML = "";
  const box = document.createElement("div");
  box.className = "stage";
  el.appendChild(box);

  if (!cycle) {
    const t = document.createElement("div");
    t.className = "stage-title";
    t.textContent = `一共有 ${plan.scaledDividendStr}，要每 ${plan.scaledDivisorStr} 個一份來分`;
    box.appendChild(t);
    const bar = document.createElement("div");
    bar.className = "area";
    const b = document.createElement("div");
    b.className = "area-bar";
    b.style.width = "min(520px, 92%)";
    const seg = document.createElement("div");
    seg.className = "area-seg";
    seg.style.setProperty("--c", "#2a6df4");
    seg.style.flex = "1";
    seg.textContent = plan.scaledDividendStr;
    b.appendChild(seg);
    bar.appendChild(b);
    const cap = document.createElement("div");
    cap.className = "muted small center";
    cap.textContent = plan.divisorIsDecimal
      ? "先把除數變成整數，方塊才會好分喔！"
      : "接下來一個一位分給你看的。";
    bar.appendChild(cap);
    box.appendChild(bar);
    return;
  }

  const color = cycle.color;
  const unit = cycle.unitLabel;
  const title = document.createElement("div");
  title.className = "stage-title";
  title.innerHTML = `現在要分：<b style="color:${color}">${cycle.currentPart} 個${cycle.placeName}</b>（每個 = ${unit}）`;
  box.appendChild(title);

  if (cycle.groups > 9) {
    box.appendChild(areaModel(cycle));
    return;
  }

  if (phase === "take") {
    const wrap = document.createElement("div");
    wrap.className = "center";
    wrap.appendChild(tileRow(cycle.currentPartUnits, unit, color));
    const cap = document.createElement("div");
    cap.className = "muted small center";
    cap.textContent = contain
      ? `每 ${cycle.groups} 個${cycle.placeName}圈成一份，可以圈出幾份？`
      : `平均分給 ${cycle.groups} 份，每份會得到幾個？`;
    wrap.appendChild(cap);
    box.appendChild(wrap);
    return;
  }

  const groups = document.createElement("div");
  groups.className = "groups";
  const nBoxes = contain ? cycle.q : cycle.groups;
  const perBox = contain ? cycle.groups : cycle.q;
  if (nBoxes === 0) {
    const e = document.createElement("div");
    e.className = "center muted";
    e.style.fontWeight = "800";
    e.textContent = contain
      ? `連 ${cycle.groups} 個都不夠，一份也圈不出來 → 商 0`
      : `不夠分，每份都是 0 → 商 0`;
    groups.appendChild(e);
  }
  for (let g = 0; g < nBoxes; g++) {
    const gd = document.createElement("div");
    gd.className = "group" + (g === 0 ? " hero" : "");
    const lab = document.createElement("div");
    lab.className = "group-label";
    lab.textContent = `第 ${g + 1} 份`;
    gd.appendChild(lab);
    if (perBox > 0) gd.appendChild(tileRow(perBox, unit, color, 20));
    else {
      const e = document.createElement("div");
      e.className = "muted small";
      e.textContent = "沒有分到";
      gd.appendChild(e);
    }
    groups.appendChild(gd);
  }
  box.appendChild(groups);

  const each = document.createElement("div");
  each.className = "center";
  each.style.fontWeight = "800";
  each.style.marginTop = "8px";
  each.innerHTML = contain
    ? `每 ${cycle.groups} 個${cycle.placeName}圈一份，圈得出 <b style="color:${color}">${cycle.q}</b> 份 → 商的${cycle.placeName}寫 <b style="color:${color}">${cycle.q}</b>`
    : `每份分到 <b style="color:${color}">${cycle.q}</b> 個${cycle.placeName} → 商的${cycle.placeName}寫 <b style="color:${color}">${cycle.q}</b>`;
  box.appendChild(each);

  if (cycle.remainderUnits > 0 && (phase === "subtract" || phase === "bringdown" || phase === "done")) {
    const lo = document.createElement("div");
    lo.className = "leftover";
    lo.appendChild(document.createTextNode(`還剩下 ${cycle.remainderUnits} 個${cycle.placeName}：`));
    lo.appendChild(tileRow(cycle.remainderUnits, unit, "#b9c6d8", 30));
    box.appendChild(lo);
    const tip = document.createElement("div");
    tip.className = "muted small center";
    tip.textContent = `剩下的 ${cycle.remainderUnits} 比 ${cycle.groups} 小，不夠再分一份了 ✓`;
    box.appendChild(tip);
  }
}

function areaModel(cycle) {
  const wrap = document.createElement("div");
  wrap.className = "area";
  const bar = document.createElement("div");
  bar.className = "area-bar";
  bar.style.width = "min(560px, 96%)";
  const seg = document.createElement("div");
  seg.className = "area-seg";
  seg.style.setProperty("--c", cycle.color);
  seg.style.flex = String(cycle.q * cycle.groups || 0.0001);
  seg.textContent = `${cycle.groups} 份 × 每份 ${cycle.q} = ${cycle.q * cycle.groups}`;
  bar.appendChild(seg);
  if (cycle.remainderUnits > 0) {
    const r = document.createElement("div");
    r.className = "area-seg rest";
    r.style.flex = String(cycle.remainderUnits);
    r.textContent = `剩 ${cycle.remainderUnits}`;
    bar.appendChild(r);
  }
  wrap.appendChild(bar);
  const cap = document.createElement("div");
  cap.className = "muted small center";
  cap.textContent = `想：${cycle.groups} × ? 最接近 ${cycle.currentPart} 但不超過它 → 商 ${cycle.q}，剩下 ${cycle.remainderUnits}`;
  wrap.appendChild(cap);
  return wrap;
}

/**
 * 小數點搬家：被除數與除數同時 ×10^k
 */
export function renderMove(el, plan, played) {
  el.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "move";
  el.appendChild(wrap);

  const mk = (raw, cls) => {
    const row = document.createElement("div");
    row.className = "move-row";
    const num = document.createElement("span");
    num.className = "move-num " + cls;
    const [ip, fp = ""] = String(raw).split(".");
    num.appendChild(document.createTextNode(ip));
    if (fp !== "" || plan.factorExp > 0) {
      const dot = document.createElement("span");
      dot.className = "dot" + (played ? " slide ghost" : "");
      dot.textContent = ".";
      dot.style.setProperty("--slide", `${plan.factorExp * 0.62}em`);
      num.appendChild(dot);
    }
    if (fp !== "") num.appendChild(document.createTextNode(fp));
    row.appendChild(num);
    const badge = document.createElement("span");
    badge.className = "badge-times" + (played ? " on" : "");
    badge.textContent = `× ${plan.factorLabel}`;
    row.appendChild(badge);
    const eq = document.createElement("span");
    eq.className = "arrow-eq";
    eq.textContent = "→";
    row.appendChild(eq);
    const res = document.createElement("span");
    res.className = "move-num " + cls;
    res.style.borderColor = played ? "#8fd9bb" : "var(--line)";
    res.style.background = played ? "#f0fbf6" : "#fff";
    res.textContent = played ? (cls === "dividend" ? plan.scaledDividendStr : plan.scaledDivisorStr) : "?";
    row.appendChild(res);
    return row;
  };

  wrap.appendChild(mk(plan.divisorStr, "divisor"));
  wrap.appendChild(mk(plan.dividendStr, "dividend"));

  const note = document.createElement("div");
  note.className = "center";
  note.style.fontWeight = "800";
  note.innerHTML = played
    ? `兩個數同時乘以 ${plan.factorLabel}，<span style="color:var(--ok)">商不會變</span>！現在變成熟悉的 <b>${plan.scaledDividendStr} ÷ ${plan.scaledDivisorStr}</b>`
    : `除數 ${plan.divisorStr} 還有小數，先讓它變成整數吧！`;
  wrap.appendChild(note);

  if (played) {
    const why = document.createElement("div");
    why.className = "why";
    why.innerHTML =
      `<b>為什麼可以這樣做？</b><br>` +
      `把「${plan.divisorStr}」看成新的單位：把 ${plan.dividendStr} 和 ${plan.divisorStr} 都換成 ${plan.factorExp === 1 ? "0.1" : "0.01"} 來數，` +
      `${plan.dividendStr} 變成 <b>${plan.scaledDividendStr}</b> 個、${plan.divisorStr} 變成 <b>${plan.scaledDivisorStr}</b> 個，` +
      `「可以分幾份」的<b>份數不會變</b>，所以商一樣。`;
    wrap.appendChild(why);
  }
}
