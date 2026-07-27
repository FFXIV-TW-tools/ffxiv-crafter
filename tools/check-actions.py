#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check-actions.py — 機械護欄（健檢 DATA-1）。

確保 data/craft-actions.json 的鍵集合與 wasm/src/lib.rs 的 Action 變體完全一致。
防「重編 wasm 新增/改名 Action 卻忘了重跑 tools/build-data.py」→ 求解器吐出 craft-actions.json
沒有的變體 → app.js actionName() 靜默回退英文 → 巨集該行貼進遊戲失效（難察覺，因不報錯）。

用 py -3.11 tools/check-actions.py 跑；exit 0 = 一致、exit 1 = drift。
"""
import json
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
    if not missing and not extra:
        if not icons_ok:
            return 1
        print("✓ action-set 一致：%d 個 Action 變體 == craft-actions.json 鍵（icon 全數有效）" % len(lib))
        return 0
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
