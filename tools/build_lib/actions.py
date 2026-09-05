# -*- coding: utf-8 -*-
"""craft-actions.json：35 個 raphael Action 變體 → 繁中名 + icon。

**權威＝game_ref.sqlite**（craft_actions 表由 XIVDiscordBot/scripts/build_game_ref.py 建），
DRY 鐵則：禁自建技能對照表。
"""
import json, os, sqlite3, sys

from .common import GAME_REF, OUT

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
# game_ref 缺漏時的最後安全網（2026-07-16 起 game_ref 已補 46843 → 正常對到 35/35、本表閒置；
# 僅當 game_ref 重建倒退時接手，勿刪）。
# ⚠ 名字必須與 game_ref 的 SUPPLEMENT_CRAFT_ACTIONS 同步：46843 是**宇宙探索（月球）專用**技能、
#   **台服尚未開放**，故只能用国服名的機轉「宇宙穩手」，不得自造（2026-08-03 修：原為自造的「群星穩定」）。
FALLBACK_TC = {"StellarSteadyHand": "宇宙穩手"}


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


def write_craft_actions():
    """產 craft-actions.json（缺 game_ref 一律硬失敗——沒有它連技能名都是假的）。"""
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
