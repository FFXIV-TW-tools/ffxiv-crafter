# -*- coding: utf-8 -*-
"""level-sync.json：哪些配方會依職業等級同步。

**權威＝game_ref.sqlite 的 recipe_level_sync**（由 Recipe.MaxAdjustableJobLevel 解出）。
"""
import json, os, sqlite3

from .common import GAME_REF, OUT


def write_level_sync(recipes):
    """level-sync.json：配方 id → 該配方資料所依據的最高職業等級（Recipe.MaxAdjustableJobLevel）。

    **權威＝game_ref.sqlite 的 recipe_level_sync**（DRY 鐵則：禁在此自建「哪些配方會同步」的名單，
    也禁用「rlv==690」之類的形狀猜測——那是現況巧合，改版就靜默失效）。
    現況全部是宇宙探索配方（8 職 × 96 ＝ 768），值恆為 100。
    等級 → 生效 rlv 的換算刻意留在前端（app-level-sync.js）：recipe_levels.json 是前端的資料，
    在這裡再算一次就是第二份會漂移的對照（同 quality-stages 的理由）。
    """
    con = sqlite3.connect(GAME_REF)
    have = {int(r["id"]) for r in recipes}
    out, orphan = {}, 0
    for rid, lv in con.execute("SELECT recipe_id, max_adjustable_job_level FROM recipe_level_sync"):
        if rid not in have:
            orphan += 1
            continue
        out[str(rid)] = lv
    con.close()
    with open(os.path.join(OUT, "level-sync.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("✓ level-sync.json：%d 個配方會依職業等級同步（%d 筆不在本站配方表內，已略過）"
          % (len(out), orphan))
