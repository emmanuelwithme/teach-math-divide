#!/usr/bin/env python
"""截圖 / 錄影檢查工具（只在專案內執行）

用法：
  .venv/bin/python tools/shot.py --base http://127.0.0.1:8137 --out shots --video
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

MODES = ["int-int", "dec-int", "int-dec", "dec-dec"]
W, H = 1360, 900


def shot(page, out, name, full=True):
    path = Path(out) / f"{name}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(path), full_page=full)
    print(f"  📸 {path}")
    return str(path)


def collect_console(page, errors):
    page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))


def go(page, base, url, errors, wait=0.5):
    page.goto(base + url, wait_until="networkidle")
    page.wait_for_timeout(int(wait * 1000))
    return page


def do_home(page, base, out, errors):
    go(page, base, "/index.html", errors)
    shot(page, out, "01-home")
    # 手機尺寸
    page.set_viewport_size({"width": 420, "height": 900})
    page.wait_for_timeout(300)
    shot(page, out, "02-home-mobile")
    page.set_viewport_size({"width": W, "height": H})


def do_learn(page, base, out, errors):
    for i, mode in enumerate(MODES):
        go(page, base, f"/learn.html?mode={mode}", errors)
        st = page.evaluate("__md.state")
        total = st["total"]
        pb = st["plan"]
        print(f"  {mode}: {pb['dividendStr']} ÷ {pb['divisorStr']} = {pb['quotientStr']}  ({total} 步)")
        shot(page, out, f"10-learn-{mode}-intro")
        for fr in range(total):
            page.evaluate(f"__md.to({fr})")
            page.wait_for_timeout(180)
            kind = "mid" if fr % 3 == 0 else "step"
            shot(page, out, f"10-learn-{mode}-{fr:02d}{kind}")
        # 位值標記開啟
        page.click("#placeBtn")
        page.evaluate(f"__md.to({total - 1})")
        page.wait_for_timeout(250)
        shot(page, out, f"10-learn-{mode}-places")


def do_learn_custom(page, base, out, errors):
    cases = [("8.4", "0.4"), ("84", "0.4"), ("8.4", "4"), ("84", "4"), ("1.44", "0.6"), ("0.1", "0.4")]
    for a, b in cases:
        go(page, base, "/learn.html?mode=dec-dec", errors)
        page.evaluate(f"__md.load({a!r}, {b!r})")
        page.wait_for_timeout(400)
        st = page.evaluate("__md.state")
        total = st["total"]
        page.evaluate(f"__md.to({total - 1})")
        page.wait_for_timeout(300)
        shot(page, out, f"11-custom-{a.replace('.', 'p')}-{b.replace('.', 'p')}")


def do_play(page, base, out, errors, video=False):
    for mode in MODES:
        go(page, base, f"/play.html?mode={mode}", errors)
        st = page.evaluate("__md.state")
        pb = st["plan"]
        print(f"  {mode}: {pb['dividendStr']} ÷ {pb['divisorStr']} (state={st['state']})")
        shot(page, out, f"20-play-{mode}-start")
        # 提示面板
        if st["state"] == "askDigit":
            page.click("#hintBtn")
            page.wait_for_timeout(250)
            shot(page, out, f"20-play-{mode}-hint")
        # 故意答錯一次，看回饋
        wrong = (pb["cycles"][0]["q"] + 3) % 10
        if wrong == pb["cycles"][0]["q"]:
            wrong = (wrong + 1) % 10
        page.evaluate(f"__md.answer({wrong})")
        page.wait_for_timeout(350)
        shot(page, out, f"20-play-{mode}-wrong")
        # 完整答對
        page.evaluate("__md.solveAll()")
        page.wait_for_timeout(1200)
        # 輪詢直到本題結束
        for _ in range(40):
            s = page.evaluate("__md.state")
            if s["state"] == "qDone":
                break
            page.wait_for_timeout(600)
        shot(page, out, f"20-play-{mode}-done")
        st = page.evaluate("__md.state")
        print(f"    → 答案 {st['plan']['quotientStr']} 星星 {st['stars']}")


def do_play_round(page, base, out, errors):
    go(page, base, "/play.html?mode=dec-dec", errors)
    for i in range(5):
        page.evaluate("__md.solveAll()")
        for _ in range(40):
            s = page.evaluate("__md.state")
            if s["state"] in ("qDone", "roundDone"):
                break
            page.wait_for_timeout(600)
        page.evaluate("__md.nextQuestion()")
        page.wait_for_timeout(700)
    shot(page, out, "30-play-result")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8137")
    ap.add_argument("--out", default="shots")
    ap.add_argument("--pages", default="home,learn,custom,play,round")
    ap.add_argument("--video", action="store_true")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()

    pages = [p.strip() for p in args.pages.split(",") if p.strip()]
    known = ("home", "learn", "custom", "play", "round")
    unknown = [p for p in pages if p not in known]
    if unknown:
        ap.error(f"--pages 有未知的頁面 {unknown}，可用：{', '.join(known)}")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    t0 = time.time()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        ctx_args = {"viewport": {"width": W, "height": H}, "device_scale_factor": 2}
        if args.video:
            vdir = out / "video"
            vdir.mkdir(parents=True, exist_ok=True)
            ctx_args["record_video_dir"] = str(vdir)
            ctx_args["record_video_size"] = {"width": W, "height": H}
        ctx = browser.new_context(**ctx_args)
        page = ctx.new_page()
        collect_console(page, errors)

        if "home" in pages:
            do_home(page, args.base, out, errors)
        if "learn" in pages:
            do_learn(page, args.base, out, errors)
        if "custom" in pages:
            do_learn_custom(page, args.base, out, errors)
        if "play" in pages:
            do_play(page, args.base, out, errors, args.video)
        if "round" in pages:
            do_play_round(page, args.base, out, errors)

        ctx.close()
        browser.close()

    Path(out / "console.json").write_text(json.dumps(errors, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n完成：{time.time() - t0:.1f}s，console 問題 {len(errors)} 則")
    for e in errors[:20]:
        print("   ⚠", e[:200])
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
