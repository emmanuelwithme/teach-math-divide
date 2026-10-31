// 直式除法板渲染
import { placeColor, placeName } from "./math.js";

const PHASE_ORDER = ["take", "quotient", "multiply", "subtract", "bringdown", "done"];

export function phaseIndex(p) {
  const i = PHASE_ORDER.indexOf(p);
  return i < 0 ? 0 : i;
}

/** 高亮目前進行的步驟；傳 null（或 done）代表全部清空 */
export function paintPhaseChips(phase) {
  const on = !!phase && phase !== "done";
  document.querySelectorAll(".phase-chip").forEach((chip) => {
    chip.classList.toggle("on", on && chip.dataset.p === phase);
  });
}

/**
 * @param {HTMLElement} el
 * @param {object} plan  planDivision() 的結果
 * @param {object} view  { activeCycle, phase, hideAnswer, showPlaces, answeredWrong:Set }
 */
export function renderBoard(el, plan, view = {}) {
  const active = view.activeCycle ?? plan.cycles.length;
  const phase = view.phase ?? "done";
  const pi = phaseIndex(phase);
  const totalCols = plan.totalDigitCols;
  const decPos = plan.scaledDecPos;
  const hasPoint = totalCols > decPos || plan.cycles.some((c) => c.placeExp < 0);

  // 建立欄位索引
  const digitCol = [];
  let col = 2;
  let pointCol = null;
  const tmpl = ["auto"];
  for (let i = 0; i < totalCols; i++) {
    if (hasPoint && i === decPos) { pointCol = col; tmpl.push("calc(var(--cell)*.55)"); col++; }
    digitCol[i] = col;
    tmpl.push("var(--cell)");
    col++;
  }
  if (hasPoint && pointCol === null) pointCol = col;

  el.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "ld-grid";
  grid.style.gridTemplateColumns = tmpl.join(" ");
  const rowTmpl = ["var(--cell)", "var(--cell)"];
  for (let i = 0; i < plan.cycles.length; i++) rowTmpl.push("var(--cell)", "12px", "var(--cell)");
  grid.style.gridTemplateRows = rowTmpl.join(" ");
  el.appendChild(grid);

  const put = (row, column, text, cls, extra) => {
    const s = document.createElement("div");
    s.className = "ld-cell " + (cls || "");
    s.style.gridRow = row;
    s.style.gridColumn = column;
    s.textContent = text;
    if (extra) extra(s);
    grid.appendChild(s);
    return s;
  };

  // 除數
  put(2, 1, plan.scaledDivisorStr, "ld-divisor", (s) => {
    s.style.gridColumn = 1;
  });

  // 被除數（補 0 由「落下」階段出現，這裡只畫原本有的位）
  const baseLen = plan.scaledDividendDigits.length - plan.extraZeroCount;
  plan.scaledDividendDigits.slice(0, baseLen).forEach((d, i) => {
    const cls = "ld-dividend ld-cur";
    const inWindow = active >= 0 && i <= (plan.cycles[Math.max(active, 0)]?.digitIndex ?? -1);
    put(2, digitCol[i], d, cls + (phase === "take" && active >= 0 && inWindow ? " hl-soft" : ""));
  });
  if (hasPoint && pointCol) put(2, pointCol, ".", "ld-dividend pt");

  // 商
  plan.cycles.forEach((c) => {
    const shown = c.index < active || (c.index === active && pi >= phaseIndex("quotient"));
    if (!shown) return;
    if (view.hideAnswer && c.index === active) return;
    const cls = "q" + (c.index === active && phase === "quotient" ? " pop" : "");
    put(1, digitCol[c.digitIndex], String(c.q), cls, (s) => {
      s.style.setProperty("--pc", placeColor(c.placeExp));
      if (view.showPlaces) {
        const t = document.createElement("span");
        t.className = "tag";
        t.textContent = c.placeName;
        s.appendChild(t);
      }
    });
  });
  if (hasPoint && pointCol) {
    const anyQ = plan.cycles.some(
      (c) => (c.index < active || (c.index === active && pi >= phaseIndex("quotient"))) && c.placeExp < 0
    );
    if (anyQ || (active > 0 && plan.cycles.some((c) => c.placeExp < 0 && c.index < active))) {
      put(1, pointCol, ".", "q", (s) => { s.style.setProperty("--pc", "#16233a"); });
    }
  }

  // 每一輪：乘積列 + 減線/餘數列
  plan.cycles.forEach((c) => {
    const done = c.index < active;
    const cur = c.index === active;
    const pIdx = done ? 5 : cur ? pi : -1;
    if (pIdx < 0) return;
    const base = 3 + 3 * c.index;
    const rightCol = digitCol[c.digitIndex];
    const startCol = rightCol - c.currentPart.length + 1;

    if (pIdx >= phaseIndex("multiply")) {
      const prod = c.product;
      for (let j = 0; j < prod.length; j++) {
        const cc = put(base, rightCol - (prod.length - 1) + j, prod[j], "ld-prod"
          + (cur && phase === "multiply" ? " pop" : ""));
        if (cur && phase === "multiply") cc.classList.add("hl");
      }
    }
    if (pIdx >= phaseIndex("subtract")) {
      // 減線：獨立一列，位在乘積之下、餘數之上
      const line = document.createElement("div");
      line.className = "ld-cell ld-line";
      line.style.gridRow = base + 1;
      line.style.gridColumn = `${startCol} / ${rightCol + 1}`;
      grid.appendChild(line);

      const rem = c.remainder;
      const remShown = done || phase === "subtract" || phase === "bringdown" || phase === "done";
      if (remShown) {
        for (let j = 0; j < rem.length; j++) {
          put(base + 2, rightCol - (rem.length - 1) + j, rem[j], "ld-rem"
            + (cur && phase === "subtract" ? " pop hl" : ""));
        }
      }
      // 落下下一位
      if (c.bringDown && (done || phase === "bringdown" || phase === "done")) {
        const bdCol = digitCol[c.digitIndex + 1];
        if (bdCol) {
          const isExtra = c.bringDown.isExtra;
          put(base + 2, bdCol, c.bringDown.digit, "ld-cur" + (isExtra ? " ghost" : "")
            + (cur && phase === "bringdown" ? " pop hl" : ""));
        }
      }
    }
  });

  // 圖例
  if (view.showLegend) {
    const leg = document.createElement("div");
    leg.className = "ld-legend";
    const used = [...new Set(plan.cycles.map((c) => c.placeExp))];
    used.forEach((e) => {
      const s = document.createElement("span");
      s.innerHTML = `<i style="background:${placeColor(e)}"></i>${placeName(e)}`;
      leg.appendChild(s);
    });
    el.appendChild(leg);
  }
}
