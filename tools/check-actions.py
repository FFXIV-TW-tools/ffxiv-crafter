#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check-actions.py — 機械護欄（健檢 DATA-1）。

確保 data/craft-actions.json 的鍵集合與 wasm/src/lib.rs 的 Action 變體完全一致。
防「重編 wasm 新增/改名 Action 卻忘了重跑 tools/build-data.py」→ 求解器吐出 craft-actions.json
沒有的變體 → app.js actionName() 靜默回退英文 → 巨集該行貼進遊戲失效（難察覺，因不報錯）。

用 py -3.11 tools/check-actions.py 跑；exit 0 = 一致、exit 1 = drift。
"""
import json
import hashlib
import os
import re
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass  # best-effort 編碼設定（窄 except，符合鐵則豁免 a）

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
LIB_RS = os.path.join(ROOT, "wasm", "src", "lib.rs")
Cargo_LOCK = os.path.join(ROOT, "wasm", "Cargo.lock")
BUILD_STAMP = os.path.join(ROOT, "wasm", "BUILD-STAMP.json")
ACTIONS_JSON = os.path.join(ROOT, "data", "craft-actions.json")


def lib_variants():
    """取 action_name() 的 match arms — 求解器實際能 emit 的權威 Action 變體集合。"""
    src = open(LIB_RS, encoding="utf-8").read()
    m = re.search(r"fn action_name.*?\{(.*?)\n\}", src, re.S)
    body = m.group(1) if m else src
    return set(re.findall(r"Action::(\w+)\s*=>", body))


# CraftAction sheet 的未使用佔位列（ClassJobLevel=1）Icon 一律是這張灰底紅斜線圖。
# 選到它 → 手法序列上看起來像「已刪除技能」，但不會報錯 → 需機械守（2026-07-27 實際踩到 7 個技能）。
PLACEHOLDER_ICON = "000786.png"


def normalized_sha256(path):
    """讀 bytes 後只將 CRLF 正規化為 LF；必須與 build-wasm.ps1 完全一致。"""
    with open(path, "rb") as f:
        normalized = f.read().replace(b"\r\n", b"\n")
    return hashlib.sha256(normalized).hexdigest()


def check_build_stamp():
    """確認 pkg/ 的建置戳記仍對應目前 WASM 原始碼與依賴鎖檔。"""
    sync_error = "✗ pkg/ 與 wasm/src 不同步，請跑 tools\\build-wasm.ps1"
    if not os.path.isfile(BUILD_STAMP):
        print(sync_error, file=sys.stderr)
        print("→ 缺少 wasm/BUILD-STAMP.json", file=sys.stderr)
        return False

    try:
        with open(BUILD_STAMP, encoding="utf-8") as f:
            stamp = json.load(f)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        print(sync_error, file=sys.stderr)
        print("→ 無法讀取 wasm/BUILD-STAMP.json：%s" % exc, file=sys.stderr)
        return False

    if not isinstance(stamp, dict):
        print(sync_error, file=sys.stderr)
        print("→ wasm/BUILD-STAMP.json 格式無效", file=sys.stderr)
        return False

    expected = {
        "lib_rs": normalized_sha256(LIB_RS),
        "cargo_lock": normalized_sha256(Cargo_LOCK),
    }
    labels = {"lib_rs": "lib.rs", "cargo_lock": "Cargo.lock"}
    mismatches = []
    for field, expected_hash in expected.items():
        actual_hash = stamp.get(field)
        if actual_hash != expected_hash:
            mismatches.append((labels[field], actual_hash, expected_hash))

    if mismatches:
        print(sync_error, file=sys.stderr)
        for label, stamped_hash, current_hash in mismatches:
            print("→ %s 不同步（戳記：%s；現況：%s）" %
                  (label, stamped_hash or "缺少", current_hash), file=sys.stderr)
        return False

    print("✓ pkg/ 與 wasm/src 同步：BUILD-STAMP.json 的 lib.rs / Cargo.lock hash 一致")
    return True


def check_icons(data):
    """icon 健全性：不得為空、不得是 game_ref 的「無圖示」佔位圖。"""
    bad_null = sorted(k for k, v in data.items() if not (v or {}).get("icon"))
    bad_ph = sorted(k for k, v in data.items() if PLACEHOLDER_ICON in ((v or {}).get("icon") or ""))
    ok = True
    if bad_null:
        print("✗ %d 個變體無 icon（UI 會缺圖）：%s" % (len(bad_null), bad_null), file=sys.stderr)
        ok = False
    if bad_ph:
        print("✗ %d 個變體取到佔位圖 %s（看起來像已刪除技能）：%s"
              % (len(bad_ph), PLACEHOLDER_ICON, bad_ph), file=sys.stderr)
        print("→ build-data.py 的 lookup() 應排除佔位 icon 並取 class_job_level 最大的列", file=sys.stderr)
        ok = False
    return ok


def main():
    lib = lib_variants()
    if not lib:
        print("✗ 無法從 lib.rs 解析 Action 變體（action_name 格式可能已改）", file=sys.stderr)
        return 1
    data = json.load(open(ACTIONS_JSON, encoding="utf-8"))
    keys = set(data.keys())
    icons_ok = check_icons(data)
    missing = lib - keys   # solver 能吐但 craft-actions 沒有 → 巨集該行會失效
    extra = keys - lib     # craft-actions 多的（無害，但代表 drift）
    actions_ok = not missing and not extra and icons_ok
    if actions_ok:
        print("✓ action-set 一致：%d 個 Action 變體 == craft-actions.json 鍵（icon 全數有效）" % len(lib))
    sync_ok = check_build_stamp()
    if actions_ok and sync_ok:
        return 0
    if not actions_ok:
        if missing:
            print("✗ craft-actions.json 缺 %d 個 solver 能吐的變體（巨集會失效）：%s"
                  % (len(missing), sorted(missing)), file=sys.stderr)
        if extra:
            print("⚠ craft-actions.json 多 %d 個 lib.rs 無的鍵：%s"
                  % (len(extra), sorted(extra)), file=sys.stderr)
        print("→ 重跑 tools/build-data.py 使兩者對齊", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
