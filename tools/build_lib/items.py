# -*- coding: utf-8 -*-
"""配方資料的複製與 items.json 生成。

recipes/recipe_levels/ingredients/meals/medicine 從 best-craft 凍結的 static-data 複製（同 monorepo
遊戲資料，那批另有自己的重建節奏）；items.json 則自 item_lookup 生成（含 icon，給 UI 顯示物品/原料圖示）。
"""
import json, os, shutil, sqlite3

from .common import ITEM_LOOKUP, OUT, STATIC_SRC, problem


def copy_static_data():
    """複製 recipes / recipe_levels / ingredients / meals / medicine（best-craft 凍結）。"""
    for fn in ("recipes.json", "recipe_levels.json", "ingredients.json", "meals.json", "medicine.json"):
        src = os.path.join(STATIC_SRC, fn)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(OUT, fn))
            print("✓ 複製 %s (%.1f MB)" % (fn, os.path.getsize(src) / 1024 / 1024))
        else:
            problem("缺 static-data 來源：" + src + "（先跑 best-craft 的 build-static-data.py）")


def write_items():
    """items.json：自 item_lookup 生成（含 icon，給 UI 顯示物品/原料圖示）。

    回傳讀進來的 recipes（quality-stages / level-sync 接著要用同一份，不重讀 4MB）。
    """
    recipes = json.load(open(os.path.join(OUT, "recipes.json"), encoding="utf-8"))
    ingredients = json.load(open(os.path.join(OUT, "ingredients.json"), encoding="utf-8"))
    needed = set()
    for r in recipes:
        if r.get("item_id"):
            needed.add(int(r["item_id"]))
    for arr in ingredients.values():
        for iid, _ in arr:
            needed.add(int(iid))
    icon_con = sqlite3.connect(ITEM_LOOKUP)
    items, miss = {}, 0
    for iid in needed:
        row = icon_con.execute(
            "SELECT id,name_tc,level_item,can_be_hq,icon,ui_category,name_sc,patch FROM items WHERE id=?", (iid,)).fetchone()
        if not row:
            miss += 1
            continue
        items[str(iid)] = {"id": row[0], "name": row[1] or ("#" + str(row[0])),
                           "level": row[2] or 0, "can_be_hq": bool(row[3]), "icon": row[4] or None,
                           "category": row[5] or "",  # 道具種類（ItemUICategory 繁中，item_lookup ui_category）→ UI 配方名副行說明
                           # 簡中名只供**搜尋比對**（顯示一律繁中）：不少人記的是陸服名或從
                           # 簡中攻略複製過來，打簡體查不到會以為工具沒有這個配方。
                           "name_sc": row[6] or "",
                           # 實裝版本（item_lookup.items.patch）→ 配方表的版本欄與版本篩選。
                           # **不自建對照表**：繁中服開服即 7.0，故前端把 <7.0 併成一個選項、7.0 以後按實際版號分。
                           # 查無寫 None（前端顯「—」），不猜——猜出來的版本會讓篩選靜默漏掉配方。
                           "patch": row[7] or None}
    icon_con.close()
    with open(os.path.join(OUT, "items.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, separators=(",", ":"))
    no_patch = sum(1 for v in items.values() if not v.get("patch"))
    print("✓ items.json：%d items（含 icon 與實裝版本，%d 查無、%d 無版本）" % (len(items), miss, no_patch))
    return recipes
