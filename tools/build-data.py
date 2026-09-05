#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build-data.py — 產出 ffxiv-crafter 的 data/。

1. craft-actions.json：35 個 raphael Action 變體 → 繁中名 + icon（**權威=game_ref.sqlite**，
   DRY 鐵則：禁自建技能對照表。craft_actions 表由 XIVDiscordBot/scripts/build_game_ref.py 建）。
2. recipes/recipe_levels/items.json：從 best-craft 凍結的 static-data 複製（同 monorepo 遊戲資料）。
3. quality-stages.json：配方的三段品質門檻（**權威=game_ref.sqlite 的 recipe_quality_stages**，
   由 build_game_ref.py 從 Recipe.CollectableMetadata 解出。DRY 鐵則：禁自建收藏值對照表）。

本檔只留「哪個旗標跑哪幾段、順序是什麼」與缺件收尾；每段的實作與它的「為什麼」在 build_lib/ 的
對應模組（2026-09-06 拆自原 509 行單檔，健檢 R5 B-034 ③）。

跨機：monorepo 根預設**由檔案位置上溯推導**（build_lib/common.py），env FFXIV_PROJECT_ROOT 仍可覆寫。
**不要寫死磁碟機代號**——external 層明訂代號依機器而異。用 py -3.11 跑。
"""
import os, sys

# 本檔是**被直接執行的腳本**（`py -3.11 tools/build-data.py`）而非套件成員，且檔名帶連字號不能被 import
# ⇒ tools/ 不會自動在 sys.path 上（cwd 是 repo 根）。把 tools/ 塞進 path 才 import 得到 build_lib。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build_lib.actions import write_craft_actions
from build_lib.common import OUT, PROBLEMS
from build_lib.consumables import enrich_consumables
from build_lib.items import copy_static_data, write_items
from build_lib.level_sync import write_level_sync
from build_lib.quests import write_job_quests, write_vendors
from build_lib.stages import write_quality_stages


def main():
    os.makedirs(OUT, exist_ok=True)
    # 只補食藥 icon 時不必重刷 3.5MB 配方資料
    if "--consumables-only" in sys.argv:
        enrich_consumables()
        return
    if "--quests-only" in sys.argv:                    # 只重刷職業任務（不動 3.5MB 配方資料）
        write_job_quests()
        write_vendors(os.path.join(OUT, "job-quests.json"))
        return

    write_craft_actions()

    # 只修技能對照時不必重刷 3.5MB 配方資料（那批來源是 best-craft 凍結的 static-data，另有自己的重建節奏）
    if "--actions-only" in sys.argv:
        print("（--actions-only：略過 recipes / items 重建）")
        return

    copy_static_data()
    enrich_consumables()
    recipes = write_items()

    write_quality_stages(recipes)
    write_level_sync(recipes)
    write_job_quests()
    write_vendors(os.path.join(OUT, "job-quests.json"))


if __name__ == "__main__":
    main()
    if PROBLEMS:
        print(file=sys.stderr)
        print("✗ 上游輸入有 %d 項缺件，data/ 的對應檔案**維持上一輪的舊內容**：" % len(PROBLEMS),
              file=sys.stderr)
        for m in PROBLEMS:
            print("   - " + m, file=sys.stderr)
        sys.exit(1)
