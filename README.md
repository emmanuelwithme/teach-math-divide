# 直式除法闖關村（teach-math-divide）

給國小（含特教）學生的直式除法視覺化網頁遊戲：**整數÷整數、整數÷小數、小數÷整數、小數÷小數** 四種組合，
從「看得見的方塊」到「直式對位」一步一步對應，並說明背後的原理（位值、等分除／包含除、商不變性質、分配律）。

## 怎麼開始（離線可用、零相依）

```bash
cd /home/lab/projects/teach-math-divide
python3 -m http.server 8137        # 或任何靜態伺服器
# 瀏覽器打開 http://127.0.0.1:8137/index.html
```

純 HTML/CSS/原生 JS ES Modules，**沒有框架、沒有 build、不會連外**，進度只存在這台裝置的瀏覽器 localStorage。

> ⚠️ 因為用的是 ES Modules，**直接雙擊 `index.html`（`file://`）會被瀏覽器擋掉而出現白頁**，一定要用上面的本地伺服器開啟。

## 三個頁面

| 頁面 | 用途 |
|---|---|
| `index.html` | 首頁：四種組合選單、累計星星、給老師的說明 |
| `learn.html?mode=…` | **學一學**：老師帶著看。左邊分方塊圖像、右邊直式，`看→商→乘→減·比→落下` 五步逐幀同步，可自動播放、可開位值標記，底部有「為什麼這樣算是對的」拆解 |
| `play.html?mode=…` | **玩一玩**：學生自己按 0–9 答每一步的商；答錯只給提示不處罰，可看九九表提示、可看示範，一輪 5 題結算星星 |

`mode` 可為 `int-int`、`int-dec`、`dec-int`、`dec-dec`；`level` 為 1（輕鬆）/ 2（一般）/ 3（挑戰）。
兩個頁面右下角都有「老師指定題目」，可直接輸入被除數與除數。

## 教學設計重點

1. **位值同色**：十位、個位、十分位、百分位在各處都是同一個顏色，方塊圖與直式互相對照。
2. **等分除 vs 包含除**：除以整數用「平均分給 N 份」，除以小數用「每 N 個圈一份」，圖像會跟著換。
3. **商不變性質**：除數有小數時，先做「小數點搬家」動畫（被除數、除數同時 ×10、×100），並用「換單位來數」解釋為什麼商不變；玩一玩裡要學生自己選 ×10 或 ×100。
4. **補 0 與小數點**：除到最後還有餘數時，畫面會提示「點上小數點、補 0 繼續除」。
5. **原理拆解**：每題都用分配律展示，例如 `696 ÷ 8`：`8×80=640`、`8×7=56`、`640+56=696` → `80+7=87`。
6. **特友善**：大按鈕（≥52px）、大字、無時間壓力、答錯只給具體提示（如「6×7=42 超過 34 了，換小一點」）、可重複、可鍵盤操作。

## 開發／驗證工具（全部只在這個資料夾內）

```bash
python3 -m venv .venv && ./.venv/bin/pip install playwright
PLAYWRIGHT_BROWSERS_PATH=$PWD/.playwright-browsers ./.venv/bin/python -m playwright install chromium

node tools/test-engine.mjs                   # 除法引擎 1800+ 斷言（需 node ≥16，無相依）
./.venv/bin/python tools/audit.py   # DOM 幾何＋直式對位（文字版直式）
./.venv/bin/python tools/shot.py --video  # 截圖與錄影 → shots/
```

`PLAYWRIGHT_BROWSERS_PATH=$PWD/.playwright-browsers` 只在第一次下載 Chromium 時需要；之後直接跑 `audit.py`／`shot.py` 即可。
`tools/audit.py --only home|learn|custom|play`、`tools/shot.py --pages home,play` 可只跑部分頁面（寫錯會直接報錯）。

- `tools/audit.py` 會把直式還原成文字表格，逐幀檢查對位、溢出、重疊、字級、按鈕尺寸。
- `tools/shot.py` 產生 `shots/*.png` 與 `shots/video/*.webm` 供人工檢視。
- 頁面暴露 `window.__md`（`next/prev/to/load/answer/solveAll/…`）讓腳本可操作。

## 環境隔離

- Python 套件只裝在 `.venv/`，Chromium 只下載到 `.playwright-browsers/`，都在本資料夾內，不動 conda base 與其他專案。
- 伺服器只綁 `127.0.0.1`，頁面不請求任何外部資源（字型、CDN、分析全部不用）。

## 檔案

```
index.html learn.html play.html
css/base.css css/board.css css/pages.css
js/math.js       精確小數（BigInt）與位值顏色
js/division.js   直式除法引擎、步驟產生、題目產生器（反算保證整除）、情境故事、原理拆解
js/board.js      直式板渲染（含補 0、小數點對齊、減線）
js/stage.js      分方塊／面積模型／小數點搬家動畫
js/learn.js js/play.js js/home.js js/sfx.js js/store.js
```
