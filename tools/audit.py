#!/usr/bin/env python
"""DOM 幾何檢查工具（不需要看圖就能驗證版面與直式對位）

用法：
  .venv/bin/python tools/audit.py --base http://127.0.0.1:8137
"""
import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

W, H = 1360, 900
MODES = ["int-int", "dec-int", "int-dec", "dec-dec"]

AUDIT_JS = r"""
() => {
  const problems = [];
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 2) {
    problems.push(`橫向溢出: scrollWidth=${de.scrollWidth} clientWidth=${de.clientWidth}`);
  }
  // 文字被截斷
  document.querySelectorAll('.narrate, .story, .mode-card, .ld-cell, .tile, .btn, .key, .group-label').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (el.scrollWidth > el.clientWidth + 3 && cs.overflow !== 'auto' && cs.overflowX !== 'auto' && el.className.indexOf('ld-scroll') < 0) {
      const t = (el.textContent || '').trim().slice(0, 28);
      if (t) problems.push(`文字可能被截斷 <${el.tagName}.${el.className.split(' ')[0]}> "${t}" ${el.scrollWidth}>${el.clientWidth}`);
    }
    const fs = parseFloat(cs.fontSize);
    if (fs < 12 && el.textContent.trim()) problems.push(`字級過小 ${fs}px <${el.tagName}.${el.className.split(' ')[0]}> "${(el.textContent||'').trim().slice(0,20)}"`);
  });
  // 可點擊元件高度
  document.querySelectorAll('button').forEach(b => {
    if (b.disabled) return;
    const r = b.getBoundingClientRect();
    if (r.height > 0 && r.height < 34) problems.push(`按鈕過小 ${Math.round(r.height)}px "${b.textContent.trim().slice(0,12)}"`);
    if (r.width > 0 && r.width < 34) problems.push(`按鈕過窄 ${Math.round(r.width)}px "${b.textContent.trim().slice(0,12)}"`);
  });
  // 重疊檢查（主要區塊）
  const boxes = [...document.querySelectorAll('.card')].map(c => ({ c, r: c.getBoundingClientRect() }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      if (a.width === 0 || b.width === 0) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 8 && oy > 8) problems.push(`卡片重疊 ${ox}x${oy}px`);
    }
  }
  return { problems, title: document.title, bodyH: de.scrollHeight };
}
"""

BOARD_JS = r"""
() => {
  const grid = document.querySelector('.ld-grid');
  if (!grid) return null;
  const cells = [...grid.children].map(el => {
    const r = el.getBoundingClientRect();
    return {
      t: el.textContent.trim(),
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
      cls: el.className,
      line: el.classList.contains('ld-line'),
    };
  });
  const gr = grid.getBoundingClientRect();
  return { cells, grid: { x: Math.round(gr.left), y: Math.round(gr.top), w: Math.round(gr.width), h: Math.round(gr.height) } };
}
"""


def ascii_board(data, cols=8):
    """把直式格子還原成文字表格，確認對位是否正確"""
    if not data or not data["cells"]:
        return "(無直式)"
    xs = sorted({c["x"] for c in data["cells"]})
    ys = sorted({(c["y"] + c["h"] - 3) if c["line"] else c["y"] for c in data["cells"]})
    def xi(x):
        return min(range(len(xs)), key=lambda i: abs(xs[i] - x))
    def yi(y):
        return min(range(len(ys)), key=lambda i: abs(ys[i] - y))
    rows = [[" "] * len(xs) for _ in ys]
    for c in data["cells"]:
        if c["line"]:
            r = yi(c["y"] + c["h"] - 2)
            for x in range(c["x"], c["x"] + max(c["w"], 1), 24):
                if 0 <= r < len(rows):
                    rows[r][xi(x)] = "─"
            continue
        if not c["t"]:
            continue
        r, col = yi(c["y"]), xi(c["x"])
        t = c["t"]
        rows[r][col] = t if (len(t) == 1 or "ld-divisor" in c["cls"]) else t[0]
    return "\n".join("  " + " ".join(r) for r in rows)


def stage_js():
    return r"""
() => {
  const groups = [...document.querySelectorAll('.group')].map(g => ({
    label: (g.querySelector('.group-label')||{}).textContent || '',
    tiles: g.querySelectorAll('.tile').length,
    tileText: [...g.querySelectorAll('.tile')].map(t=>t.textContent).join(','),
  }));
  const leftover = document.querySelector('.leftover');
  return {
    title: (document.querySelector('.stage-title')||{}).textContent || '',
    groups,
    leftover: leftover ? leftover.textContent.trim() : null,
    tilesTotal: document.querySelectorAll('.stage .tile').length,
  };
}
"""


def run(base, only=None, verbose=False):
    errors = []
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2)
        pg = ctx.new_page()
        pg.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))

        def audit(url, tag):
            pg.goto(base + url, wait_until="networkidle")
            pg.wait_for_timeout(350)
            r = pg.evaluate(AUDIT_JS)
            if r["problems"]:
                fails.append((tag, r["problems"]))
                print(f"✗ {tag}")
                for x in r["problems"][:12]:
                    print("    -", x)
            else:
                print(f"✓ {tag}  (頁高 {r['bodyH']})")
            return r

        if only in (None, "home"):
            audit("/index.html", "首頁")
            pg.set_viewport_size({"width": 400, "height": 850})
            audit("/index.html?mobile", "首頁(手機 400px)")
            pg.set_viewport_size({"width": W, "height": H})

        if only in (None, "learn"):
            for m in MODES:
                audit(f"/learn.html?mode={m}", f"學一學 {m}")
            # 逐幀檢查 + 直式對位
            for m in MODES:
                pg.goto(base + f"/learn.html?mode={m}", wait_until="networkidle")
                pg.wait_for_timeout(400)
                total = pg.evaluate("__md.state")["total"]
                pb = pg.evaluate("__md.state")["plan"]
                print(f"\n  [{m}] {pb['dividendStr']} ÷ {pb['divisorStr']} = {pb['quotientStr']}"
                      + (f" 餘 {pb['remainderStr']}" if pb["remainderStr"] else "") + f"  （{total} 幀）")
                for fr in range(total):
                    pg.evaluate(f"__md.to({fr})")
                    pg.wait_for_timeout(110)
                    bd = pg.evaluate(BOARD_JS)
                    st = pg.evaluate(stage_js())
                    narr = pg.evaluate("document.querySelector('.narrate').innerText.replace(/\\n/g,' / ').slice(0,72)")
                    extra = ""
                    if st["groups"]:
                        extra = f" | 方塊 {len(st['groups'])} 份×{st['groups'][0]['tiles']} 塊"
                    if st["leftover"]:
                        extra += f" | {st['leftover'][:22]}"
                    print(f"  {fr:02d} | {narr}{extra}")
                    if fr in (total - 1, total - 2) or fr % 5 == 0:
                        print(ascii_board(bd))
                    r = pg.evaluate(AUDIT_JS)
                    for x in r["problems"]:
                        if "溢出" in x or "重疊" in x:
                            print("    ⚠", x)

        if only in (None, "custom"):
            for a, bb in [("8.4", "0.4"), ("84", "0.4"), ("8.4", "4"), ("1.44", "0.6"), ("0.1", "0.4"), ("1000", "8"), ("97", "4")]:
                pg.goto(base + "/learn.html", wait_until="networkidle")
                pg.wait_for_timeout(250)
                pg.evaluate(f"__md.load({a!r}, {bb!r})")
                pg.wait_for_timeout(300)
                st = pg.evaluate("__md.state")
                total = st["total"]
                pg.evaluate(f"__md.to({total - 1})")
                pg.wait_for_timeout(200)
                print(f"\n  {a} ÷ {bb} = {st['plan']['quotientStr']}"
                      + (f" 餘 {st['plan']['remainderStr']}" if st["plan"]["remainderStr"] else ""))
                print(ascii_board(pg.evaluate(BOARD_JS)))
                r = pg.evaluate(AUDIT_JS)
                for x in r["problems"]:
                    print("    ⚠", x)

        if only in (None, "play"):
            for m in MODES:
                audit(f"/play.html?mode={m}", f"玩一玩 {m}")
            pg.goto(base + "/play.html?mode=dec-dec", wait_until="networkidle")
            pg.wait_for_timeout(400)
            pb = pg.evaluate("__md.state")["plan"]
            print(f"\n  闖關 {pb['dividendStr']} ÷ {pb['divisorStr']}")
            if pb["divisorIsDecimal"]:
                pg.evaluate("__md.chooseFactor(null)")
                pg.wait_for_timeout(1800)
            for i in range(len(pb["cycles"])):
                q = pb["cycles"][i]["q"]
                pg.evaluate(f"__md.answer({q})")
                pg.wait_for_timeout(2500)
                print(f"  第{i+1}輪 商={q}")
                print(ascii_board(pg.evaluate(BOARD_JS)))
                st = pg.evaluate(stage_js())
                if st["groups"]:
                    print(f"       方塊: {len(st['groups'])} 份 × {st['groups'][0]['tiles']} 塊"
                          + (f" | {st['leftover']}" if st["leftover"] else ""))
                if pg.evaluate("__md.state")["state"] == "needBringDown":
                    pg.evaluate("__md.bringDown()")
                    pg.wait_for_timeout(1100)
            print("  最終狀態:", pg.evaluate("__md.state")["state"])
            r = pg.evaluate(AUDIT_JS)
            for x in r["problems"]:
                print("    ⚠", x)

        ctx.close()
        b.close()

    if errors:
        print("\nconsole 錯誤：")
        for e in errors[:20]:
            print("  ⚠", e[:200])
    Path("shots").mkdir(exist_ok=True)
    Path("shots/audit.json").write_text(json.dumps({"fails": fails, "errors": errors}, ensure_ascii=False, indent=2), encoding="utf-8")
    return 1 if (errors or fails) else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8137")
    ap.add_argument("--only", default=None)
    a = ap.parse_args()
    if a.only and a.only not in ("home", "learn", "custom", "play"):
        ap.error(f"--only 只能選 home / learn / custom / play，收到：{a.only}")
    sys.exit(run(a.base, a.only))
