// 直式除法引擎驗證：node tools/test-engine.mjs
import { planDivision, makeProblem, resolveCustom, MODE_ORDER } from "../js/division.js";
import { parseDecimal, toBig, fromBig, shiftPoint, scaleOf, mul, pretty } from "../js/math.js";

let pass = 0, fail = 0;
function ok(cond, msg, extra = "") {
  if (cond) { pass++; }
  else { fail++; console.log("  ✗ " + msg + (extra ? "  → " + extra : "")); }
}

function asScaled(str) {
  const n = parseDecimal(str);
  const s = scaleOf(n);
  return { big: toBig(shiftPoint(n, s)), scale: s };
}

function eqNum(a, b) {
  const A = asScaled(a), B = asScaled(b);
  const s = Math.max(A.scale, B.scale);
  return A.big * 10n ** BigInt(s - A.scale) === B.big * 10n ** BigInt(s - B.scale);
}

// 全部用 BigInt 相加，測試本身不能引入浮點誤差
function sumExact(a, b) {
  const A = asScaled(a), B = asScaled(b);
  const s = Math.max(A.scale, B.scale);
  return pretty(fromBig(A.big * 10n ** BigInt(s - A.scale) + B.big * 10n ** BigInt(s - B.scale), s));
}

function checkPlan(dividend, divisor, expectQ, expectR = null, allowRemainder = false) {
  const p = planDivision(dividend, divisor, { allowRemainder, maxFrac: 4 });
  ok(eqNum(p.quotientStr, expectQ), `${dividend} ÷ ${divisor} 商應為 ${expectQ}`, `得到 ${p.quotientStr}`);
  if (expectR === null) {
    ok(p.remainderStr === null, `${dividend} ÷ ${divisor} 應整除`, `餘數 ${p.remainderStr}`);
  } else {
    ok(p.remainderStr === expectR, `${dividend} ÷ ${divisor} 餘數應為 ${expectR}`, `得到 ${p.remainderStr}`);
  }
  // 驗算：除數 × 商 (+ 餘數) = 被除數，並檢查引擎自己算的 checkStr
  const prod = pretty(mul(parseDecimal(divisor), parseDecimal(p.quotientStr)));
  const left = p.remainderStr ? sumExact(prod, p.remainderStr) : prod;
  ok(eqNum(left, dividend), `${dividend} ÷ ${divisor} 驗算 ${divisor}×${p.quotientStr}${p.remainderStr ? "+" + p.remainderStr : ""} 應等於 ${dividend}`, `得到 ${left}`);
  ok(eqNum(p.checkStr, dividend), `${dividend} ÷ ${divisor} 引擎的 checkStr 應等於被除數`, `checkStr=${p.checkStr}`);
  ok(p.exact === (p.remainderStr === null), `${dividend} ÷ ${divisor} exact 與餘數不一致`);
  // 每輪內部一致性
  const dv = BigInt(p.scaledDivisorStr);
  let carry = 0n;
  let t = 0;
  for (const c of p.cycles) {
    let cur = 0n;
    while (t <= c.digitIndex) {
      cur = carry * 10n + BigInt(p.scaledDividendDigits[t] ?? "0");
      carry = cur % dv;
      t++;
    }
    ok(BigInt(c.currentPart) === cur, `${dividend}÷${divisor} 第${c.index + 1}輪 被除部分錯誤`, `${c.currentPart} vs ${cur}`);
    ok(BigInt(c.product) === BigInt(c.q) * dv, `第${c.index + 1}輪 乘積錯誤`);
    ok(BigInt(c.currentPart) === BigInt(c.product) + BigInt(c.remainder), `第${c.index + 1}輪 減法不一致`);
    ok(BigInt(c.remainder) < dv, `第${c.index + 1}輪 餘數未小於除數`);
  }
  return p;
}

console.log("— 整數 ÷ 整數 —");
checkPlan("84", "4", "21");
checkPlan("96", "8", "12");
checkPlan("100", "4", "25");
checkPlan("804", "4", "201");
checkPlan("125", "5", "25");
checkPlan("1000", "8", "125");
checkPlan("97", "4", "24", "1", true);
checkPlan("100", "7", "14", "2", true);
checkPlan("7", "3", "2", "1", true);

console.log("— 小數 ÷ 整數 —");
checkPlan("8.4", "4", "2.1");
checkPlan("1.2", "4", "0.3");
checkPlan("0.84", "4", "0.21");
checkPlan("5", "4", "1.25");
checkPlan("7.2", "8", "0.9");
checkPlan("12.6", "6", "2.1");
checkPlan("0.1", "2", "0.05");

console.log("— 整數 ÷ 小數 —");
checkPlan("84", "0.4", "210");
checkPlan("6", "0.3", "20");
checkPlan("5", "0.25", "20");
checkPlan("12", "1.2", "10");
checkPlan("1", "0.5", "2");

console.log("— 小數 ÷ 小數 —");
checkPlan("8.4", "0.4", "21");
checkPlan("0.84", "0.4", "2.1");
checkPlan("1.44", "0.6", "2.4");
checkPlan("7.2", "0.8", "9");
checkPlan("0.5", "0.2", "2.5");
checkPlan("2.25", "1.5", "1.5");
checkPlan("0.1", "0.4", "0.25");

console.log("— 隨機題 300 筆（驗算 + 有限小數）—");
for (const mode of MODE_ORDER) {
  for (let lv = 1; lv <= 3; lv++) {
    for (let i = 0; i < 25; i++) {
      const p = makeProblem(mode, lv);
      const chk = planDivision(p.dividend, p.divisor, { allowRemainder: mode === "int-int", maxFrac: 4 });
      const prod = pretty(mul(parseDecimal(p.divisor), parseDecimal(chk.quotientStr)));
      const left = chk.remainderStr ? sumExact(prod, chk.remainderStr) : prod;
      ok(eqNum(left, p.dividend), `[${mode} L${lv}] ${p.dividend}÷${p.divisor} 驗算失敗`, `${p.divisor}×${chk.quotientStr}${chk.remainderStr ? "+" + chk.remainderStr : ""}=${left} ≠ ${p.dividend}`);
      ok(eqNum(chk.checkStr, p.dividend), `[${mode} L${lv}] ${p.dividend}÷${p.divisor} checkStr 錯誤`, `checkStr=${chk.checkStr}`);
      ok(chk.exact || mode === "int-int", `[${mode} L${lv}] ${p.dividend}÷${p.divisor} 應整除`, `餘 ${chk.remainderStr}`);
      ok(chk.cycles.length >= 1 && chk.cycles.length <= 7, `[${mode} L${lv}] ${p.dividend}÷${p.divisor} 輪數 ${chk.cycles.length} 不合理`);
      ok(Number(p.dividend) <= 999 && Number(p.divisor) <= 999, `[${mode} L${lv}] 數字過大 ${p.dividend},${p.divisor}`);
    }
  }
}

console.log("— 除不盡（補 0 截斷）與邊界 —");
{
  const p = planDivision("1.0", "3", { allowRemainder: false, maxFrac: 4 });
  ok(p.quotientStr === "0.3333", "1.0÷3 應截到四位小數 0.3333", p.quotientStr);
  ok(p.remainderStr === "0.0001", "1.0÷3 餘數應是 0.0001（不是整數 1）", String(p.remainderStr));
  ok(eqNum(p.checkStr, "1"), "1.0÷3 驗算要回到被除數 1", p.checkStr);
  ok(!p.exact, "1.0÷3 不是整除");
}
{
  const p = planDivision("0.1234002", "2", { allowRemainder: false, maxFrac: 4 });
  ok(p.quotientStr === "0.0617001", "0.1234002÷2 被除數原有的位數要除完，不受 maxFrac 限制", p.quotientStr);
  ok(p.exact && p.remainderStr === null, "0.1234002÷2 應整除", `餘 ${p.remainderStr}`);
}
{
  const p = planDivision("1", "0.3", { allowRemainder: false, maxFrac: 4 });
  ok(p.remainderStr === "0.00001", "1÷0.3 的餘數要再除以搬家倍數 10^k", String(p.remainderStr));
  ok(eqNum(p.checkStr, "1"), "1÷0.3 驗算要回到 1", p.checkStr);
}
{
  const p = planDivision("8.", "3", { allowRemainder: true, maxFrac: 4 });
  ok(p.quotientStr === "2" && p.remainderStr === "2", "8.÷3 應是 2 餘 2", `${p.quotientStr} 餘 ${p.remainderStr}`);
}
{
  const p = planDivision("5", "4", { allowRemainder: false, maxFrac: 4 });
  const n = p.cycles.filter((c) => c.needDecimalPoint).length;
  ok(n === 1, "5÷4 只在第一次補 0 時提示點小數點", `出現 ${n} 次`);
  ok(p.cycles[0].needDecimalPoint === true, "5÷4 第一輪就要點小數點");
}
{
  const p = planDivision("0.5", "4", { allowRemainder: false, maxFrac: 4 });
  ok(p.cycles.every((c) => !c.needDecimalPoint), "0.5÷4 小數點從第一位就有，補 0 不必再提示",
    JSON.stringify(p.cycles.map((c) => c.needDecimalPoint)));
}
for (const [a, b] of [["-84", "4"], ["84", "-4"], ["-0.5", "2"]]) {
  let threw = false;
  try { planDivision(a, b, { allowRemainder: true, maxFrac: 4 }); } catch (e) { threw = /正數/.test(e.message); }
  ok(threw, `${a} ÷ ${b} 應拒絕負數`);
}
{
  let threw = false;
  try { planDivision("5", "0"); } catch (e) { threw = /0/.test(e.message); }
  ok(threw, "除數 0 應被拒絕");
}

console.log("— resolveCustom（老師手動輸入）—");
{
  const p = resolveCustom("8.", "3");
  ok(p.mode === "int-int", "8.÷3 應推論為 int-int", p.mode);
  ok(p.plan.remainderStr === "2", "8.÷3 應有餘數", String(p.plan.remainderStr));
}
{
  const p = resolveCustom("84", "0.4");
  ok(p.mode === "int-dec", "84÷0.4 應推論為 int-dec", p.mode);
  ok(p.story.kind === "contain", "整÷小 應使用包含除故事", p.story.kind);
}
{
  const p = resolveCustom(" 08.50 ", " 0.5 ");
  ok(p.dividend === "8.5" && p.divisor === "0.5", "輸入要正規化", `${p.dividend},${p.divisor}`);
  ok(p.mode === "dec-dec", "08.50÷0.5 應推論為 dec-dec", p.mode);
}
for (const [a, b] of [["", "3"], ["3", ""], ["3", "0"], ["3", "0.0"], ["abc", "2"], ["-", "2"], ["1.2.3", "2"], ["1e3", "2"], ["-2", "3"]]) {
  let threw = false;
  try { resolveCustom(a, b); } catch (e) { threw = !!e.message; }
  ok(threw, `resolveCustom(${JSON.stringify(a)}, ${JSON.stringify(b)}) 應被拒絕`);
}
{
  let msg = "";
  try { resolveCustom("123456789012", "7"); } catch (e) { msg = e.message; }
  ok(/步驟太多/.test(msg), "步驟過長要擋下", msg);
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
