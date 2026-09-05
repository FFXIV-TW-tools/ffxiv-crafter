# -*- coding: utf-8 -*-
"""共用底座：缺件台帳（PROBLEMS/problem）、上游輸入與輸出的路徑常數、stdout 編碼設定。"""
import os, sys

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError): pass  # best-effort 編碼設定：stream 無 reconfigure / 不支援編碼（窄 except，符合 except:pass 鐵則豁免 a）

# 缺上游輸入時的處理（B-030，2026-08-16）：以前是印一行 ⚠ 然後照跑到底、**exit 0**。
# 那等於「我以為我重建了資料，其實 data/ 還是上一輪的舊檔」——而且輸出末尾照樣一整排 ✓。
# 現在改成：問題全部收集起來（一次看完所有缺件，不是修一個跑一次），跑完印總表並 **exit 1**。
# 刻意**不**在缺件當下就中止：既有行為是「缺的那份不覆蓋」＝前一個好狀態原地保留，這點正確，
# 要改的只有「回報成功」這件事（對外邊界 fail-closed 的同一條教義：失敗要看得見、好狀態要留著）。
PROBLEMS = []


def problem(msg):
    print("⚠ " + msg, file=sys.stderr)
    PROBLEMS.append(msg)


HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)                      # <repo>/tools（job-quest-qty.json 住這裡）
# 預設由本檔位置推導（build_lib → tools → ffxiv-crafter → external → monorepo 根），
# 不寫死 `C:/FFXIVProject`：磁碟機代號依機器而異（external 層明訂的跨機規則），
# 寫死的話換一台機器就靜默指到不存在的路徑。
ROOT = os.environ.get("FFXIV_PROJECT_ROOT") or os.path.normpath(os.path.join(HERE, "..", "..", "..", ".."))
GAME_REF = os.path.join(ROOT, "data", "item_dict", "game_ref.sqlite")
ITEM_LOOKUP = os.path.join(ROOT, "data", "item_dict", "item_lookup.sqlite")
DUMP_TC = os.path.join(ROOT, "data", "item_dict", "datamining_tc")
JOBS_JSON = os.path.join(ROOT, "data", "item_dict", "jobs.json")
STATIC_SRC = os.path.join(ROOT, "ffxiv-best-craft-main", "public", "static-data")
OUT = os.path.normpath(os.path.join(TOOLS, "..", "data"))
