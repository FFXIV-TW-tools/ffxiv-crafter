#!/bin/sh
# CF Pages build step — 把「該上線的檔案」複製到 _site/，其餘一概不部署。
#
# 為什麼需要這支：CF Pages 的 Git 整合在沒有 build 步驟時，預設把 repo 根整棵目錄
# 當靜態資產上傳 → AGENTS.md / docs/health-reviews/ / tools/*.py / wasm/src 全部變成
# 該網域下可直接 GET 的公開檔（2026-08-01 健檢實測：/AGENTS.md 回 200）。
# private repo 保護的是「誰能 clone」，不是「部署出去的檔案誰能下載」；
# .gitignore（那些檔是 tracked）、_headers（只加標頭）、robots.txt（只擋搜尋引擎收錄，
# 不擋直接輸入網址）三者都擋不到，唯一解是不要把它們上傳。
#
# 搭配的 dashboard 設定（Pages 專案 → Settings → Build）：
#   Build command            : sh deploy-prepare.sh
#   Build output directory   : _site
#
# 白名單而非黑名單：日後新增內部檔案（新的 spec / 新的 tools 腳本）不會因為
# 忘了加排除規則就靜默外洩。要新增「站台檔」時才動這份清單。
set -eu

OUT=_site
rm -rf "$OUT"
mkdir -p "$OUT"

# --- 站台檔（會被玩家的瀏覽器實際載入的東西）---
cp index.html styles.css "$OUT"/
cp app.js app-browse.js app-consumable.js app-flow.js app-render.js app-solve.js "$OUT"/
cp crafting-list.js worker.js "$OUT"/
cp favicon-192.png robots.txt sitemap.xml _headers "$OUT"/
cp -r data pkg "$OUT"/
# pkg/ 是 wasm-pack 產物：瀏覽器只需要 .js 與 .wasm，型別定義與 npm metadata 不必上線
rm -f "$OUT"/pkg/*.d.ts "$OUT"/pkg/package.json "$OUT"/pkg/.gitignore

# --- 授權義務：pkg/*.wasm 是二進位衍生作品，Apache-2.0 §4(a) 要求隨散布交付 License 副本 ---
# 頁尾直連 /LICENSE-APACHE-2.0.txt，故此檔必須上線（拿掉會讓授權連結 404 ＝ 等於沒交付）。
cp LICENSE-APACHE-2.0.txt "$OUT"/

# --- 壓縮：剝註解 + 壓縮區域變數名（一般網站的標準做法）---
# 為什麼：無建置架構下「原始碼 == 部署產物」，於是註解也上線——實測含「對抗審 grok」
# 「BACKLOG B-006 待 Owner 拍板」等內部決策脈絡。壓縮把它們一併剝掉。
# 注意這**不是隱藏**：壓縮碼丟進 formatter 仍可讀，邏輯依然公開（所有前端碼都如此）。
# 目的是對齊一般網站的常態，不是保密。刻意**不產 source map**（產了等於把原始碼還原回去）。
# 版本 pin 住：不讓部署路徑吃到未預期的新版行為。
for f in "$OUT"/*.js; do
  npx --yes esbuild@0.28.1 "$f" --minify --charset=utf8 --target=es2022 --outfile="$f.min" >/dev/null 2>&1 && mv "$f.min" "$f"
done

# --- 驗收：確認沒有任何內部檔混進輸出（build 階段就擋，不等上線才發現）---
LEAK=$(find "$OUT" -type f \( -name '*.md' -o -name '*.py' -o -name '*.ps1' -o -name '*.mjs' -o -name '*.rs' -o -name '*.toml' -o -name '*.lock' \) | head -20)
if [ -n "$LEAK" ]; then
  echo "✗ 內部檔混入部署輸出，中止：" >&2
  echo "$LEAK" >&2
  exit 1
fi

echo "✓ 部署輸出就緒：$(find "$OUT" -type f | wc -l) 個檔案"
