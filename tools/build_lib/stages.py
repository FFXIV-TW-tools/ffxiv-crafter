# -*- coding: utf-8 -*-
"""quality-stages.json：配方的三段品質門檻。

**權威＝game_ref.sqlite 的 recipe_quality_stages**（由 build_game_ref.py 從 Recipe.CollectableMetadata
解出。DRY 鐵則：禁自建收藏值對照表）。
"""
import json, os, sqlite3

from .common import GAME_REF, OUT


def write_quality_stages(recipes):
    """quality-stages.json：配方 id → 三段品質門檻。只收本站真的有的配方（其餘是死條目）。

    值的單位隨 src 不同，**換算刻意留在前端**（app.js recipeMaxes 是滿品質的唯一實作，
    在這裡再算一次就是第二份會漂移的公式）：
      collectable → 收藏價值，目標品質 = 值 × 10
      cosmic      → 滿品質百分比，目標品質 = 滿品質 × 值 / 100
    某一檔為 0 ＝該配方沒有那一檔（UI 不得列出來）。查不到的配方就是沒有分階，只能求滿品質。
    """
    con = sqlite3.connect(GAME_REF)
    have = {int(r["id"]) for r in recipes}
    out, orphan = {}, 0
    for rid, src, s1, s2, s3 in con.execute(
            "SELECT recipe_id, source, stage1, stage2, stage3 FROM recipe_quality_stages"):
        if rid not in have:
            orphan += 1
            continue
        out[str(rid)] = {"src": src, "stages": [s1, s2, s3]}
    con.close()
    with open(os.path.join(OUT, "quality-stages.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    bysrc = {}
    for v in out.values():
        bysrc[v["src"]] = bysrc.get(v["src"], 0) + 1
    print("✓ quality-stages.json：%d 個配方有分階 %s（%d 筆不在本站配方表內，已略過）"
          % (len(out), bysrc, orphan))
