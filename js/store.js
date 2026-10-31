// 學習進度（存在瀏覽器本地，不會外傳）
const KEY = "md.progress.v1";
const DEFAULT_ROUND_LEN = 5;

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function blank(roundLen = DEFAULT_ROUND_LEN) {
  return { stars: 0, rounds: 0, best: 0, correct: 0, total: 0, roundLen };
}

// localStorage 可能被舊版本或手動改壞，一律驗證結構與數值再用
function sanitize(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [mode, v] of Object.entries(raw)) {
    if (!v || typeof v !== "object") continue;
    out[mode] = {
      stars: num(v.stars),
      rounds: num(v.rounds),
      best: num(v.best),
      correct: num(v.correct),
      total: num(v.total),
      roundLen: num(v.roundLen) || DEFAULT_ROUND_LEN,
    };
  }
  return out;
}

function load() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY)));
  } catch (e) {
    return {};
  }
}

function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}

export const store = {
  all() { return load(); },
  get(mode) {
    return load()[mode] || blank();
  },
  addRound(mode, stars, correct, roundLen) {
    const len = num(roundLen) || DEFAULT_ROUND_LEN;
    const d = load();
    const cur = d[mode] || blank(len);
    cur.stars += num(stars);
    cur.rounds += 1;
    cur.best = Math.max(cur.best, num(stars));
    cur.correct += Math.min(num(correct), len);
    cur.total += len;
    cur.roundLen = len;
    d[mode] = cur;
    save(d);
    return cur;
  },
  reset() { save({}); },
};

export function starText(n, max = 3) {
  return "★".repeat(Math.max(0, n)) + "☆".repeat(Math.max(0, max - n));
}

// 星等統一由這裡換算：總星數 ÷ 題數（四捨五入，上限 3）
export function roundRating(totalStars, questionCount) {
  const n = num(questionCount);
  if (!n) return 0;
  return Math.max(0, Math.min(3, Math.round(num(totalStars) / n)));
}
