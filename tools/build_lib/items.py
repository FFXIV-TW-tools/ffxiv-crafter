# -*- coding: utf-8 -*-
"""配方資料的複製與 items.json 生成。

recipes/recipe_levels/ingredients/meals/medicine 從 tools/static-data 的凍結快照複製（產生端＝
tools/build-static-data.py，那批另有自己的重建節奏）；items.json 則自 item_lookup 生成（含 icon，
給 UI 顯示物品/原料圖示）。
"""
import json, os, shutil, sqlite3

from .common import ITEM_LOOKUP, OUT, STATIC_SRC, problem, validate_recipe_bundle


def copy_static_data():
    """複製一個通過關聯驗證的 recipes / levels / ingredients 快照。"""
    files = ("recipes.json", "recipe_levels.json", "ingredients.json", "meals.json", "medicine.json")
    payloads, missing = {}, False
    for fn in files:
        src = os.path.join(STATIC_SRC, fn)
        if not os.path.exists(src):
            problem("缺 static-data 來源：" + src + "（先跑 tools/build-static-data.py）")
            missing = True
            continue
        try:
            with open(src, encoding="utf-8") as f:
                payloads[fn] = json.load(f)
        except (OSError, UnicodeError, ValueError) as exc:
            problem("static-data 來源無法讀取：" + src + "（%s）" % exc)
            missing = True
    if missing:
        return False
    try:
        validate_recipe_bundle(payloads["recipes.json"], payloads["recipe_levels.json"],
                               payloads["ingredients.json"])
    except ValueError as exc:
        problem("static-data 配方關聯無效：%s" % exc)
        return False

    for fn in files:
        src = os.path.join(STATIC_SRC, fn)
        shutil.copy(src, os.path.join(OUT, fn))
        print("✓ 複製 %s (%.1f MB)" % (fn, os.path.getsize(src) / 1024 / 1024))
    return True


def write_items():
    """items.json：自 item_lookup 生成（含 icon，給 UI 顯示物品/原料圖示）。

    回傳讀進來的 recipes（quality-stages / level-sync 接著要用同一份，不重讀 4MB）。
    """
    try:
        with open(os.path.join(OUT, "recipes.json"), encoding="utf-8") as f:
            recipes = json.load(f)
        with open(os.path.join(OUT, "ingredients.json"), encoding="utf-8") as f:
            ingredients = json.load(f)
    except (OSError, UnicodeError, ValueError) as exc:
        problem("items.json 上游配方資料無法讀取：%s" % exc)
        return None
    needed = set()
    for r in recipes:
        if r.get("item_id"):
            needed.add(int(r["item_id"]))
    for arr in ingredients.values():
        for iid, _ in arr:
            needed.add(int(iid))
    icon_con = sqlite3.connect(ITEM_LOOKUP)
    items, miss_ids = {}, []
    for iid in needed:
        row = icon_con.execute(
            "SELECT id,name_tc,level_item,can_be_hq,icon,ui_category,name_sc,patch FROM items WHERE id=?", (iid,)).fetchone()
        if not row:
            miss_ids.append(iid)
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
    if miss_ids:
        problem("item_lookup 查無配方引用 item：%s" % ", ".join(str(i) for i in sorted(miss_ids)))
        return None
    with open(os.path.join(OUT, "items.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, separators=(",", ":"))
    no_patch = sum(1 for v in items.values() if not v.get("patch"))
    print("✓ items.json：%d items（含 icon 與實裝版本，%d 查無、%d 無版本）" % (len(items), 0, no_patch))
    return recipes
