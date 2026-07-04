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


def main():
    lib = lib_variants()
    if not lib:
        print("✗ 無法從 lib.rs 解析 Action 變體（action_name 格式可能已改）", file=sys.stderr)
        return 1
    keys = set(json.load(open(ACTIONS_JSON, encoding="utf-8")).keys())
    missing = lib - keys   # solver 能吐但 craft-actions 沒有 → 巨集該行會失效
    extra = keys - lib     # craft-actions 多的（無害，但代表 drift）
    if not missing and not extra:
        print("✓ action-set 一致：%d 個 Action 變體 == craft-actions.json 鍵" % len(lib))
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
