// 直式除法引擎：產生「可教學的步驟」
// 原则：把除數變成整數（商不變性質），再做整數位值直式除法
import {
  parseDecimal, toString, pretty, toBig, fromBig, scaleOf, shiftPoint,
  allDigits, mul, placeName, placeValueLabel, placeColor,
  randInt, pick, clamp, isInteger, decimalPlaces,
} from "./math.js";

export const MODES = {
  "int-int": { label: "整數 ÷ 整數", emoji: "🍎", color: "#2a9d8f" },
  "int-dec": { label: "整數 ÷ 小數", emoji: "🍬", color: "#e07a3f" },
  "dec-int": { label: "小數 ÷ 整數", emoji: "🧃", color: "#1d7fbf" },
  "dec-dec": { label: "小數 ÷ 小數", emoji: "🎀", color: "#b5179e" },
};

export const MODE_ORDER = ["int-int", "int-dec", "dec-int", "dec-dec"];

/**
 * 產生直式除法的所有步驟（每個 cycle = 商、乘、減、比、落下 一輪）
 * opts: { allowRemainder:boolean, maxFrac:number }
 */
export function planDivision(dividendStr, divisorStr, opts = {}) {
  const allowRemainder = !!opts.allowRemainder;
  const maxFrac = opts.maxFrac ?? 3;

  const D = parseDecimal(dividendStr);
  const d = parseDecimal(divisorStr);
  if (D.neg || d.neg) throw new Error("目前只支援正數");
  if (toBig(d) === 0n) throw new Error("除數不能是 0");

  // 1) 商不變性質：被除數、除數同時乘以 10^k，讓除數變整數
  const k = scaleOf(d);
  const D2 = shiftPoint(D, k);
  const d2 = shiftPoint(d, k);
  const divisorIntStr = d2.int + (d2.frac || "");
  const dv = BigInt(divisorIntStr);

  // 2) 位值直式除法
  const digits = allDigits(D2);
  const decPos = D2.int.length; // 小數點在 digits 中的位置
  const extraZeros = [];

  const cycles = [];
  let r = 0n;
  let started = false;
  let pendingBring = null; // 尚未開始時，記錄「落下」了哪些位
  let i = 0;
  let totalLen = digits.length;
  const baseLen = digits.length;

  const digitAt = (idx) => (idx < baseLen ? digits[idx] : extraZeros[idx - baseLen]);
  // 已經「補 0」除到小數第幾位（只在被除數的位數用盡後才受限於 maxFrac）
  const fracPlacesUsed = () => {
    if (!cycles.length) return 0;
    return Math.max(0, -Math.min(...cycles.map((c) => c.placeExp)));
  };

  while (i < totalLen || (!allowRemainder && r !== 0n && fracPlacesUsed() < maxFrac)) {
    const ch = digitAt(i);
    if (ch === undefined) break;
    const cur = r * 10n + BigInt(ch);
    const placeExp = decPos - 1 - i;
    const isExtra = i >= baseLen;

    if (!started && cur < dv) {
      const moreDigits = i < baseLen - 1;
      if (moreDigits) {
        r = cur;
        pendingBring = { digit: ch, placeExp, isExtra };
        i++;
        continue;
      }
      // 最後一位了，還是比除數小 → 商 0
    }

    const q = cur / dv;
    const product = q * dv;
    const remainder = cur - product;

    started = true;
    const cycle = {
      index: cycles.length,
      digitIndex: i,
      placeExp,
      placeName: placeName(placeExp),
      unitLabel: placeValueLabel(placeExp),
      color: placeColor(placeExp),
      currentPart: cur.toString(),
      currentPartUnits: Number(cur),
      groups: Number(dv),
      q: Number(q),
      product: product.toString(),
      remainder: remainder.toString(),
      remainderUnits: Number(remainder),
      bringDown: null,
      isExtraZero: isExtra,
      needDecimalPoint: false,
      pendingBring,
    };
    pendingBring = null;
    r = remainder;
    cycles.push(cycle);
    i++;

    if (r === 0n && i >= totalLen) break;
    if (allowRemainder && i >= totalLen) break;
    // 只有「被除數的位已經除完」時，才用 maxFrac 限制補 0 的長度
    if (!allowRemainder && i >= totalLen && fracPlacesUsed() >= maxFrac) break;
    if (i >= totalLen) {
      // 補 0 繼續除；小數點只在整數跨到小數的那一次提示
      extraZeros.push("0");
      totalLen += 1;
      cycle.needDecimalPoint = extraZeros.length === 1 && cycle.placeExp >= 0;
    }
  }

  // 3) 組合商與餘數
  //    餘數的單位：補 0 後的 10^-(總位數-小數點位置)，再除以搬家倍數 10^k
  const quotientStr = buildQuotient(cycles);
  const remScale = Math.max(0, totalLen - decPos) + k;
  const remainderStr = r === 0n ? null : pretty(fromBig(r, remScale));

  // 每一輪的「落下」資訊
  for (let c = 0; c < cycles.length; c++) {
    const next = cycles[c + 1];
    const cur = cycles[c];
    if (next && next.digitIndex === cur.digitIndex + 1) {
      cur.bringDown = {
        digit: digitAt(next.digitIndex),
        isExtra: next.isExtraZero,
      };
    }
  }

  const scaledDividendStr = toString(D2);
  return {
    dividendStr: pretty(D),
    divisorStr: pretty(d),
    factorExp: k,
    factorLabel: k === 0 ? null : "1" + "0".repeat(k),
    scaledDividendStr,
    scaledDivisorStr: divisorIntStr,
    scaledDividendDigits: (allDigits(D2) + extraZeros.join("")).split(""),
    scaledDecPos: decPos,
    extraZeroCount: extraZeros.length,
    cycles,
    quotientStr,
    remainderStr,
    exact: r === 0n,
    divisorIsDecimal: k > 0,
    totalDigitCols: allDigits(D2).length + extraZeros.length,
    checkStr: buildCheck(divisorStr, quotientStr, remainderStr),
  };
}

function buildQuotient(cycles) {
  if (!cycles.length) return "0";
  const map = new Map();
  for (const c of cycles) map.set(c.placeExp, c.q);
  const exps = [...map.keys()];
  const minExp = Math.min(...exps);
  const top = Math.max(Math.max(...exps), 0);
  let out = "";
  for (let e = top; e >= minExp; e--) {
    if (e === -1) out += ".";
    out += String(map.get(e) ?? 0);
  }
  if (out.includes(".")) out = out.replace(/0+$/, "").replace(/\.$/, "");
  return out === "" ? "0" : out;
}

function buildCheck(divisorStr, quotientStr, remainderStr) {
  const d = parseDecimal(divisorStr);
  const q = parseDecimal(quotientStr);
  const p = mul(d, q);
  let s = pretty(p);
  if (remainderStr) {
    const r = parseDecimal(remainderStr);
    const sc = Math.max(scaleOf(p), scaleOf(r));
    const sum = toBig(shiftPoint(p, sc)) + toBig(shiftPoint(r, sc));
    s = pretty(fromBig(sum, sc));
  }
  return s;
}

/* ---------------- 題目產生器（反算：先選除數與商，保證整除/有限小數） ---------------- */

function fmt(n) {
  return pretty(n);
}

function makePair(mode, level) {
  // level 1 輕鬆 / 2 一般 / 3 挑戰
  const cfg = {
    "int-int": {
      1: { dMin: 2, dMax: 5, qMin: 2, qMax: 25, remainder: false, frac: 0 },
      2: { dMin: 2, dMax: 9, qMin: 3, qMax: 99, remainder: true, frac: 0 },
      3: { dMin: 6, dMax: 9, qMin: 12, qMax: 999, remainder: true, frac: 0 },
    },
    "int-dec": {
      1: { k: 1, dMin: 2, dMax: 5, qMin: 2, qMax: 12, frac: 0 },
      2: { k: 1, dMin: 2, dMax: 9, qMin: 3, qMax: 40, frac: 0 },
      3: { k: 2, dMin: 11, dMax: 49, qMin: 2, qMax: 30, frac: 0 },
    },
    "dec-int": {
      1: { dMin: 2, dMax: 5, qMin: 11, qMax: 45, frac: 1 },
      2: { dMin: 2, dMax: 9, qMin: 11, qMax: 250, frac: 1 },
      3: { dMin: 3, dMax: 9, qMin: 101, qMax: 999, frac: 2 },
    },
    "dec-dec": {
      1: { k: 1, dMin: 2, dMax: 5, qMin: 11, qMax: 45, frac: 1 },
      2: { k: 1, dMin: 2, dMax: 9, qMin: 11, qMax: 250, frac: 1 },
      3: { k: 2, dMin: 11, dMax: 45, qMin: 11, qMax: 150, frac: 2 },
    },
  }[mode][level];

  for (let attempt = 0; attempt < 400; attempt++) {
    let divisor, quotient, dividend;
    if (mode === "int-int") {
      const d = randInt(cfg.dMin, cfg.dMax);
      const q = randInt(cfg.qMin, cfg.qMax);
      const rem = cfg.remainder && Math.random() < 0.35 ? randInt(1, d - 1) : 0;
      divisor = { int: String(d), frac: "", neg: false };
      quotient = { int: String(q), frac: "", neg: false };
      dividend = fromBig(BigInt(d * q + rem), 0);
      if (rem >= d) continue;
      if (dividend.int.length > 4) continue;
    } else if (mode === "int-dec") {
      const scaled = randInt(cfg.dMin, cfg.dMax);
      const q = randInt(cfg.qMin, cfg.qMax);
      divisor = fromBig(BigInt(scaled), cfg.k);
      quotient = { int: String(q), frac: "", neg: false };
      dividend = mul(divisor, quotient);
      if (!isPlainInteger(dividend)) continue;
      if (dividend.int.length > 3) continue;
    } else if (mode === "dec-int") {
      const d = randInt(cfg.dMin, cfg.dMax);
      const qScaled = randInt(cfg.qMin, cfg.qMax);
      if (qScaled % 10 === 0 && cfg.frac > 0 && Math.random() < 0.7) continue;
      divisor = { int: String(d), frac: "", neg: false };
      quotient = fromBig(BigInt(qScaled), cfg.frac);
      dividend = mul(divisor, quotient);
      if (decimalPlaces(dividend) === 0) continue;
      if (dividend.int.length > 3) continue;
    } else {
      const scaled = randInt(cfg.dMin, cfg.dMax);
      const qScaled = randInt(cfg.qMin, cfg.qMax);
      if (qScaled % 10 === 0 && cfg.frac > 0 && Math.random() < 0.7) continue;
      divisor = fromBig(BigInt(scaled), cfg.k);
      quotient = fromBig(BigInt(qScaled), cfg.frac);
      dividend = mul(divisor, quotient);
      if (decimalPlaces(dividend) === 0) continue;
      if (dividend.int.length > 3) continue;
      if (decimalPlaces(dividend) > 3) continue;
    }

    const ds = fmt(divisor), qs = fmt(quotient), vs = fmt(dividend);
    if (ds === "0" || vs === "0") continue;
    if (Number(qs) < 1) continue;
    if (Number(vs) > 999) continue;
    const plan = safePlan(vs, ds, mode);
    if (!plan) continue;
    if (plan.cycles.length < 1 || plan.cycles.length > 7) continue;
    if (!plan.exact && mode !== "int-int") continue;
    return { dividend: vs, divisor: ds, plan, mode, level };
  }
  return fallbackProblem(mode, level);
}

function isPlainInteger(n) {
  return decimalPlaces(n) === 0 && !n.neg;
}

function safePlan(a, b, mode) {
  try {
    return planDivision(a, b, { allowRemainder: mode === "int-int", maxFrac: 3 });
  } catch (e) {
    return null;
  }
}

function fallbackProblem(mode, level) {
  const table = {
    "int-int": ["84", "4"],
    "int-dec": ["84", "0.4"],
    "dec-int": ["8.4", "4"],
    "dec-dec": ["8.4", "0.4"],
  }[mode];
  return {
    dividend: table[0], divisor: table[1], mode, level,
    plan: planDivision(table[0], table[1], { allowRemainder: mode === "int-int", maxFrac: 3 }),
  };
}

export function makeProblem(mode, level = 2) {
  const p = makePair(mode, clamp(level, 1, 3));
  p.story = makeStory(mode, p.dividend, p.divisor);
  return p;
}

/**
 * 老師手動輸入題目的唯一入口：解析 → 正規化 → 推論模式 → 決定餘數 → 產生步驟。
 * learn.js 與 play.js 的輸入框與 URL 載入都必須走這裡，避免兩份副本各行其是。
 */
export function resolveCustom(a, b) {
  if (!a || !b) throw new Error("兩個數都要填喔");
  const D = parseDecimal(a);
  const d = parseDecimal(b);
  if (D.neg || d.neg) throw new Error("目前只支援正數");
  if (toBig(d) === 0n) throw new Error("除數不能是 0");
  const dividendStr = pretty(D);
  const divisorStr = pretty(d);
  // 模式一律由「實際是不是整數」推論，不採信 URL，避免 pill／故事與題目不符
  const mode = `${isInteger(D) ? "int" : "dec"}-${isInteger(d) ? "int" : "dec"}`;
  const plan = planDivision(dividendStr, divisorStr, { allowRemainder: mode === "int-int", maxFrac: 4 });
  if (plan.cycles.length < 1) throw new Error("這題太小了，換一個數吧");
  if (plan.cycles.length > 9) throw new Error("步驟太多，換小一點的數吧");
  return {
    dividend: dividendStr,
    divisor: divisorStr,
    plan,
    mode,
    story: makeStory(mode, dividendStr, divisorStr),
  };
}

/* ---------------- 情境故事 ---------------- */

const SHARE_ITEMS = [
  { unit: "公升的果汁", verb: "平均倒進", vessel: "個瓶子", each: "每瓶", emoji: "🧃" },
  { unit: "公尺的繩子", verb: "平均剪成", vessel: "段", each: "每段", emoji: "🪢" },
  { unit: "公斤的苹果", verb: "平均裝進", vessel: "個袋子", each: "每袋", emoji: "🍎" },
  { unit: "元的糖果", verb: "平均分裝成", vessel: "包", each: "每包", emoji: "🍬" },
  { unit: "公升的水", verb: "平均倒進", vessel: "個杯子", each: "每杯", emoji: "💧" },
  { unit: "條彩帶", verb: "平均分給", vessel: "個人", each: "每人", emoji: "🎀" },
];

const CONTAIN_ITEMS = [
  { unit: "公尺的彩帶", cut: "公尺一段", emoji: "🎀" },
  { unit: "公升的果汁", cut: "公升一杯", emoji: "🧃" },
  { unit: "公斤的糖果", cut: "公斤一袋", emoji: "🍬" },
  { unit: "公尺的鐵絲", cut: "公尺一段", emoji: "📏" },
];

function makeStory(mode, dividend, divisor) {
  if (mode === "int-int" || mode === "dec-int") {
    const it = pick(SHARE_ITEMS);
    return {
      kind: "share",
      emoji: it.emoji,
      text: `把 ${dividend} ${it.unit}，${it.verb} ${divisor} ${it.vessel}，${it.each}分到多少？`,
      hint: `用「等分除（平均分）」的想法：${dividend} 分成 ${divisor} ${it.vessel}，每一${it.each.slice(1)}要一樣多。`,
    };
  }
  const it = pick(CONTAIN_ITEMS);
  return {
    kind: "contain",
    emoji: it.emoji,
    text: `${dividend} ${it.unit}，每 ${divisor} ${it.cut}，可以分成幾份？`,
    hint: `用「包含除」的想法：${dividend} 裡面有幾個 ${divisor}？`,
  };
}

export { makeStory };

/* ---------------- 原理拆解：直式＝把被除數拆成幾大塊（分配律） ---------------- */

function numAt(digit, exp) {
  if (exp >= 0) return { int: String(digit) + "0".repeat(exp), frac: "", neg: false };
  return { int: "0", frac: "0".repeat(-exp - 1) + digit, neg: false };
}

/**
 * 回傳：[{ part, product, placeName, color }] 與 total
 * 例：696 ÷ 8 → 8×80=640、8×7=56、640+56=696
 */
export function breakdown(plan) {
  const d = parseDecimal(plan.divisorStr);
  const items = plan.cycles.filter((c) => c.q !== 0).map((c) => {
    const part = numAt(c.q, c.placeExp);
    const prod = mul(d, part);
    return {
      part: pretty(part),
      product: pretty(prod),
      placeName: c.placeName,
      color: c.color,
    };
  });
  let scale = 0;
  items.forEach((i) => { scale = Math.max(scale, scaleOf(parseDecimal(i.product))); });
  if (plan.remainderStr) scale = Math.max(scale, scaleOf(parseDecimal(plan.remainderStr)));
  let sum = 0n;
  items.forEach((i) => { sum += toBig(shiftPoint(parseDecimal(i.product), scale)); });
  if (plan.remainderStr) sum += toBig(shiftPoint(parseDecimal(plan.remainderStr), scale));
  const total = pretty(fromBig(sum, scale));
  const qParts = plan.cycles.filter((c) => c.q !== 0).map((c) => pretty(numAt(c.q, c.placeExp)));
  return { items, total, remainder: plan.remainderStr, qParts };
}
