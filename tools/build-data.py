#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build-data.py — 產出 ffxiv-crafter 的 data/。

1. craft-actions.json：35 個 raphael Action 變體 → 繁中名 + icon（**權威=game_ref.sqlite**，
   DRY 鐵則：禁自建技能對照表。craft_actions 表由 XIVDiscordBot/scripts/build_game_ref.py 建）。
2. recipes/recipe_levels/items.json：從 best-craft 凍結的 static-data 複製（同 monorepo 遊戲資料）。

跨機：monorepo 根 env FFXIV_PROJECT_ROOT（預設 C:/FFXIVProject）。用 py -3.11 跑。
"""
import json, os, shutil, sqlite3, sys

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError): pass  # best-effort 編碼設定：stream 無 reconfigure / 不支援編碼（窄 except，符合 except:pass 鐵則豁免 a）

ROOT = os.environ.get("FFXIV_PROJECT_ROOT", "C:/FFXIVProject")
GAME_REF = os.path.join(ROOT, "data", "item_dict", "game_ref.sqlite")
ITEM_LOOKUP = os.path.join(ROOT, "data", "item_dict", "item_lookup.sqlite")
STATIC_SRC = os.path.join(ROOT, "ffxiv-best-craft-main", "public", "static-data")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "data"))

# raphael Action 變體 → FFXIV 英文名（對 game_ref name_en）
VARIANT_EN = {
    "BasicSynthesis": "Basic Synthesis", "BasicTouch": "Basic Touch", "MasterMend": "Master's Mend",
    "Observe": "Observe", "TricksOfTheTrade": "Tricks of the Trade", "WasteNot": "Waste Not",
    "Veneration": "Veneration", "StandardTouch": "Standard Touch", "GreatStrides": "Great Strides",
    "Innovation": "Innovation", "WasteNot2": "Waste Not II", "ByregotsBlessing": "Byregot's Blessing",
    "PreciseTouch": "Precise Touch", "MuscleMemory": "Muscle Memory", "CarefulSynthesis": "Careful Synthesis",
    "Manipulation": "Manipulation", "PrudentTouch": "Prudent Touch", "AdvancedTouch": "Advanced Touch",
    "Reflect": "Reflect", "PreparatoryTouch": "Preparatory Touch", "Groundwork": "Groundwork",
    "DelicateSynthesis": "Delicate Synthesis", "IntensiveSynthesis": "Intensive Synthesis",
    "TrainedEye": "Trained Eye", "HeartAndSoul": "Heart and Soul", "PrudentSynthesis": "Prudent Synthesis",
    "TrainedFinesse": "Trained Finesse", "RefinedTouch": "Refined Touch", "QuickInnovation": "Quick Innovation",
    "ImmaculateMend": "Immaculate Mend", "TrainedPerfection": "Trained Perfection",
    "StellarSteadyHand": "Stellar Steady Hand", "RapidSynthesis": "Rapid Synthesis",
    "HastyTouch": "Hasty Touch", "DaringTouch": "Daring Touch",
}
# game_ref 缺漏時的最後安全網（2026-07-16 起 game_ref 已補 46843 群星穩定 → 正常對到 35/35、本表閒置；
# 僅當 game_ref 重建倒退時接手，勿刪）
FALLBACK_TC = {"StellarSteadyHand": "群星穩定"}


# CraftAction sheet 對同一技能有多列（8 個 DoH 職業各一份），另有一批 ClassJobLevel=1 的**未使用佔位列**，
# 其 Icon 一律是 000786（灰底紅斜線的「無圖示」佔位圖）。原本 `ORDER BY id LIMIT 1` 取 id 最小 → 這 7 個技能
# （秘訣/比爾格的祝福/堅信/模範製作/上級加工/高速製作/倉促）會拿到佔位圖，在手法序列上看起來像「已刪除技能」。
PLACEHOLDER_ICON = "000786.png"


def lookup(con, name_en):
    """先 craft_actions（DoH 製作技能），再 actions（跨職 buff 如崇敬/改革）。回 (name_tc, icon, id, level)。

    選列策略：排除佔位 icon → 取 class_job_level 最大的那批（＝真正習得的技能列，佔位列 level 恆為 1）
    → 同批內取 id 最小（＝固定同一職業版本，避免不同技能各拿不同職業的 icon 而風格不一）。
    """
    for tbl in ("craft_actions", "actions"):
        r = con.execute(
            f"SELECT name_tc, icon_path, id, class_job_level FROM {tbl} "
            "WHERE name_en=? AND name_tc!='' AND (icon_path IS NULL OR icon_path NOT LIKE ?) "
            "ORDER BY class_job_level DESC, id ASC LIMIT 1",
            (name_en, "%/" + PLACEHOLDER_ICON)).fetchone()
        if r:
            return r
    return None


def enrich_consumables():
    """meals/medicine 補 icon + item id（best-craft 凍結資料只有 name/level/加成，無圖示）。

    比對鍵＝繁中名（item_lookup.name_tc）；`level` 欄已驗證 == items.level_item（＝物品品級），故不覆寫。
    對 OUT 內的檔就地加欄，可重複執行（idempotent）。
    """
    con = sqlite3.connect(ITEM_LOOKUP)
    for fn in ("meals.json", "medicine.json"):
        p = os.path.join(OUT, fn)
        if not os.path.exists(p):
            print("⚠ 缺 " + p + "（先跑完整 build-data.py）", file=sys.stderr); continue
        rows = json.load(open(p, encoding="utf-8"))
        miss = 0
        for e in rows:
            r = con.execute("SELECT id, icon FROM items WHERE name_tc=?", (e["name"],)).fetchone()
            if r:
                e["id"], e["icon"] = r[0], r[1]
            else:
                e["id"], e["icon"] = None, None
                miss += 1
        with open(p, "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
        print("✓ %s：%d 筆補 icon（%d 查無）" % (fn, len(rows), miss))
    con.close()


def main():
    os.makedirs(OUT, exist_ok=True)
    # 只補食藥 icon 時不必重刷 3.5MB 配方資料
    if "--consumables-only" in sys.argv:
        enrich_consumables()
        return

    if not os.path.exists(GAME_REF):
        print("✗ 找不到 game_ref.sqlite：" + GAME_REF, file=sys.stderr); sys.exit(1)
    con = sqlite3.connect(GAME_REF)

    actions = {}
    miss = []
    for variant, name_en in VARIANT_EN.items():
        r = lookup(con, name_en)
        if r:
            actions[variant] = {"nameTc": r[0], "icon": r[1], "id": r[2], "level": r[3] or 1}
        elif variant in FALLBACK_TC:
            actions[variant] = {"nameTc": FALLBACK_TC[variant], "icon": None, "id": None, "level": 100}
            miss.append(variant + "(用 fallback)")
        else:
            actions[variant] = {"nameTc": variant, "icon": None, "id": None, "level": 1}
            miss.append(variant)
    con.close()

    with open(os.path.join(OUT, "craft-actions.json"), "w", encoding="utf-8") as f:
        json.dump(actions, f, ensure_ascii=False, indent=0, separators=(",", ":"))
    print("✓ craft-actions.json：%d/%d 對到 game_ref%s" % (
        len(VARIANT_EN) - len(miss), len(VARIANT_EN),
        ("（fallback/缺：%s）" % miss) if miss else ""))

    # 只修技能對照時不必重刷 3.5MB 配方資料（那批來源是 best-craft 凍結的 static-data，另有自己的重建節奏）
    if "--actions-only" in sys.argv:
        print("（--actions-only：略過 recipes / items 重建）")
        return

    # 複製 recipes / recipe_levels / ingredients / meals / medicine（best-craft 凍結）
    for fn in ("recipes.json", "recipe_levels.json", "ingredients.json", "meals.json", "medicine.json"):
        src = os.path.join(STATIC_SRC, fn)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(OUT, fn))
            print("✓ 複製 %s (%.1f MB)" % (fn, os.path.getsize(src) / 1024 / 1024))
        else:
            print("⚠ 缺 static-data 來源：" + src + "（先跑 best-craft 的 build-static-data.py）", file=sys.stderr)

    enrich_consumables()

    # items.json：自 item_lookup 生成（含 icon，給 UI 顯示物品/原料圖示）
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
            "SELECT id,name_tc,level_item,can_be_hq,icon,ui_category FROM items WHERE id=?", (iid,)).fetchone()
        if not row:
            miss += 1
            continue
        items[str(iid)] = {"id": row[0], "name": row[1] or ("#" + str(row[0])),
                           "level": row[2] or 0, "can_be_hq": bool(row[3]), "icon": row[4] or None,
                           "category": row[5] or ""}  # 道具種類（ItemUICategory 繁中，item_lookup ui_category）→ UI 配方名副行說明
    icon_con.close()
    with open(os.path.join(OUT, "items.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, separators=(",", ":"))
    print("✓ items.json：%d items（含 icon，%d 查無）" % (len(items), miss))


if __name__ == "__main__":
    main()
