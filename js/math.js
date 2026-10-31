// 精確小數工具：一律用 BigInt 處理，避免浮點誤差
// 數字以 { int, frac, neg } 表示，value = ±(int.frac)

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function trimLeading(s) {
  const t = s.replace(/^0+/, "");
  return t === "" ? "0" : t;
}

export function parseDecimal(input) {
  let s = String(input).trim();
  if (s === "") throw new Error("空數字");
  let neg = false;
  if (s[0] === "-") { neg = true; s = s.slice(1); }
  else if (s[0] === "+") s = s.slice(1);
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") throw new Error("格式錯誤: " + input);
  let [int, frac = ""] = s.split(".");
  if (int === "") int = "0";
  int = trimLeading(int);
  return { int, frac, neg };
}

export function toString(n) {
  const sign = n.neg ? "-" : "";
  return n.frac ? `${sign}${n.int}.${n.frac}` : `${sign}${n.int}`;
}

export function toBig(n) {
  const b = BigInt(n.int + (n.frac || ""));
  return n.neg ? -b : b;
}

export function scaleOf(n) {
  return (n.frac || "").length;
}

// 小數點向右移動 k 位（等同乘以 10^k）
export function shiftPoint(n, k) {
  let int = n.int, frac = n.frac || "";
  if (k <= 0) return { int, frac, neg: n.neg };
  if (k <= frac.length) {
    int = int + frac.slice(0, k);
    frac = frac.slice(k);
  } else {
    int = int + frac + "0".repeat(k - frac.length);
    frac = "";
  }
  return { int: trimLeading(int), frac, neg: n.neg };
}

export function allDigits(n) {
  return n.int + (n.frac || "");
}

export function fromBig(big, scale) {
  let neg = big < 0n;
  let s = (neg ? -big : big).toString();
  s = s.padStart(scale + 1, "0");
  const int = scale > 0 ? s.slice(0, s.length - scale) : s;
  const frac = scale > 0 ? s.slice(s.length - scale) : "";
  return { int: trimLeading(int), frac, neg };
}

export function mul(a, b) {
  const s = scaleOf(a) + scaleOf(b);
  return fromBig(toBig(a) * toBig(b), s);
}

export function isInteger(n) {
  return (n.frac || "").replace(/0+$/, "") === "";
}

export function decimalPlaces(n) {
  const f = (n.frac || "").replace(/0+$/, "");
  return f.length;
}

// 顯示用：去掉多餘的尾端 0（但整數保持 "0"）
export function pretty(n) {
  const frac = (n.frac || "").replace(/0+$/, "");
  return toString({ int: n.int, frac, neg: n.neg });
}

export function placeName(exp) {
  const names = {
    5: "十萬位", 4: "萬位", 3: "千位", 2: "百位", 1: "十位", 0: "個位",
    "-1": "十分位", "-2": "百分位", "-3": "千分位", "-4": "萬分位",
  };
  return names[String(exp)] ?? `10^${exp}位`;
}

export function placeValueLabel(exp) {
  if (exp >= 0) return "1" + "0".repeat(exp);
  return "0." + "0".repeat(-exp - 1) + "1";
}

// 位值顏色：同一個位值在方塊圖與直式裡永遠同色
const PLACE_COLORS = {
  3: "#6a4c93", 2: "#1d7fbf", 1: "#2a9d8f", 0: "#e07a3f",
  "-1": "#e63946", "-2": "#b5179e", "-3": "#5f0f40",
};
const FALLBACK = ["#457b9d", "#6d597a", "#8d5524"];

export function placeColor(exp) {
  const k = String(exp);
  if (PLACE_COLORS[k]) return PLACE_COLORS[k];
  const idx = Math.abs(exp) % FALLBACK.length;
  return FALLBACK[idx];
}
