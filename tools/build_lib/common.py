# -*- coding: utf-8 -*-
"""共用底座：缺件台帳（PROBLEMS/problem）、上游輸入與輸出的路徑常數、stdout 編碼設定。"""
import os, sys
from collections.abc import Mapping



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

def validate_recipe_bundle(recipes, recipe_levels, ingredients):
    """Validate the three files that form one recipe snapshot.

    The static-data and data builders both consume these files as a single
    bundle.  Check all cross-file references before any member is copied so a
    partial refresh cannot combine generations.
    """
    if not isinstance(recipes, list) or not recipes:
        raise ValueError("recipes.json 必須是非空陣列")
    if not isinstance(recipe_levels, Mapping):
        raise ValueError("recipe_levels.json 必須是物件")
    if not isinstance(ingredients, Mapping):
        raise ValueError("ingredients.json 必須是物件")
    level_by_key = {str(k): v for k, v in recipe_levels.items()}
    ingredient_keys = {str(k) for k in ingredients}
    seen_ids = set()
    for pos, recipe in enumerate(recipes):
        if not isinstance(recipe, Mapping):
            raise ValueError("recipes.json 第 %d 筆不是物件" % (pos + 1))
        if "id" not in recipe:
            raise ValueError("recipes.json 第 %d 筆缺 id" % (pos + 1))
        rid = recipe["id"]
        if isinstance(rid, bool) or not isinstance(rid, int) or rid <= 0:
            raise ValueError("recipes.json 第 %d 筆 id 無效：%r" % (pos + 1, rid))
        rid_key = str(rid)
        if rid_key in seen_ids:
            raise ValueError("recipes.json 有重複 id：%s" % rid)
        seen_ids.add(rid_key)

        if "rlv" not in recipe or recipe["rlv"] is None:
            raise ValueError("recipe %s 缺 rlv" % rid)
        level_key = str(recipe["rlv"])
        if level_key not in level_by_key:
            raise ValueError("recipe %s 找不到 recipe_levels：%s" % (rid, recipe["rlv"]))
        level = level_by_key[level_key]
        if not isinstance(level, Mapping) or not level:
            raise ValueError("recipe %s 的 recipe_levels 無效或為空：%s" %
                             (rid, recipe["rlv"]))
        if rid_key not in ingredient_keys:
            raise ValueError("recipe %s 找不到 ingredients" % rid)

    for rid, rows in ingredients.items():
        if not isinstance(rows, (list, tuple)):
            raise ValueError("ingredients %s 必須是陣列" % rid)
        if str(rid) in seen_ids and not rows:
            raise ValueError("recipe %s 的 ingredients 不得為空" % rid)
        for pos, pair in enumerate(rows):
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                raise ValueError("ingredients %s 第 %d 筆不是 [item_id, qty]" % (rid, pos + 1))
            item_id, qty = pair
            if (isinstance(item_id, bool) or not isinstance(item_id, int) or item_id <= 0 or
                    isinstance(qty, bool) or not isinstance(qty, int) or qty <= 0):
                raise ValueError("ingredients %s 第 %d 筆 item_id/qty 無效：%r" %
                                 (rid, pos + 1, pair))


TOOLS = os.path.dirname(HERE)                      # <repo>/tools（job-quest-qty.json 住這裡）
# 預設由本檔位置推導（build_lib → tools → ffxiv-crafter → external → monorepo 根），
# 不寫死 `C:/FFXIVProject`：磁碟機代號依機器而異（external 層明訂的跨機規則），
# 寫死的話換一台機器就靜默指到不存在的路徑。
ROOT = os.environ.get("FFXIV_PROJECT_ROOT") or os.path.normpath(os.path.join(HERE, "..", "..", "..", ".."))
GAME_REF = os.path.join(ROOT, "data", "item_dict", "game_ref.sqlite")
ITEM_LOOKUP = os.path.join(ROOT, "data", "item_dict", "item_lookup.sqlite")
DUMP_TC = os.path.join(ROOT, "data", "item_dict", "datamining_tc")
JOBS_JSON = os.path.join(ROOT, "data", "item_dict", "jobs.json")
# 凍結配方資料（tnze zh-CN ＋ item_lookup 繁中化）＝本 repo 自有，產生端＝tools/build-static-data.py。
# 2026-09-08 自 ffxiv-best-craft-main/public/static-data 接手（best-craft 退場＝monorepo B-073）。
STATIC_SRC = os.path.join(TOOLS, "static-data")
OUT = os.path.normpath(os.path.join(TOOLS, "..", "data"))
