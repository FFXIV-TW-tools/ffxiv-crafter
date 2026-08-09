#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build-data.py — 產出 ffxiv-crafter 的 data/。

1. craft-actions.json：35 個 raphael Action 變體 → 繁中名 + icon（**權威=game_ref.sqlite**，
   DRY 鐵則：禁自建技能對照表。craft_actions 表由 XIVDiscordBot/scripts/build_game_ref.py 建）。
2. recipes/recipe_levels/items.json：從 best-craft 凍結的 static-data 複製（同 monorepo 遊戲資料）。
3. quality-stages.json：配方的三段品質門檻（**權威=game_ref.sqlite 的 recipe_quality_stages**，
   由 build_game_ref.py 從 Recipe.CollectableMetadata 解出。DRY 鐵則：禁自建收藏值對照表）。

跨機：monorepo 根 env FFXIV_PROJECT_ROOT（預設 C:/FFXIVProject）。用 py -3.11 跑。
"""
import json, os, shutil, sqlite3, sys

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError): pass  # best-effort 編碼設定：stream 無 reconfigure / 不支援編碼（窄 except，符合 except:pass 鐵則豁免 a）

ROOT = os.environ.get("FFXIV_PROJECT_ROOT", "C:/FFXIVProject")
GAME_REF = os.path.join(ROOT, "data", "item_dict", "game_ref.sqlite")
ITEM_LOOKUP = os.path.join(ROOT, "data", "item_dict", "item_lookup.sqlite")
DUMP_TC = os.path.join(ROOT, "data", "item_dict", "datamining_tc")
JOBS_JSON = os.path.join(ROOT, "data", "item_dict", "jobs.json")
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


def read_dump(name):
    """讀台服解包 CSV（datamining_tc）：第 2 行是欄名、第 4 行起是資料，中間可能夾空行。

    回 (header, rows)。**繁中名一律以此為準**（禁 OpenCC 機轉，會產出国服譯名）。
    """
    import csv
    path = os.path.join(DUMP_TC, name)
    lines = [ln for ln in open(path, encoding="utf-8") if ln.strip()]
    rr = list(csv.reader(lines))
    return rr[1], rr[3:]


def job_by_category():
    """ClassJobCategory id → 職業縮寫（CRP/BSM/…/FSH）。

    **由資料推導、不寫死**：取「恰好只有一個職業旗標為 True」的 category ⇒ 那就是該職專屬分類。
    刻意不用「cjc == classjob_id + 1」那種形狀對照——現況成立是巧合，改版就靜默錯位。
    """
    hdr, rows = read_dump("cn_ClassJobCategory.csv")
    out = {}
    for row in rows:
        on = [hdr[i] for i, v in enumerate(row) if v == "True"]
        if len(on) == 1 and row[0].isdigit():
            out[int(row[0])] = on[0]
    return out


# 社群名（簡中直譯／異體字／別名）→ item id。三段都走 item_lookup 的權威欄位，**不維護任何自建對照表**：
#   ① name_tc 直接命中 ② name_sc 直接命中 ③ 繁→簡（OpenCC t2s）後再查 name_sc
# ③ 是必要的：試算表的來源是灰機（簡中），名稱常是「把簡中原文繁化」而非台服官方名 ——
# 例「羅敏薩鳀魚」t2s→「罗敏萨鳀鱼」＝ id 4870，台服正名其實是「羅敏薩鯷魚」（鯷≠鳀）。
# 轉換結果**只用來查 id**，不產生任何顯示字串（顯示一律用解包的台服名，繁中服至上鐵則）。
# 且採用與否還要再過一道「id 必須等於解包 RITEM 的 id」——例「高級化妝盒」查得到 17878，
# 但該任務要交的是 17877「化妝盒的材料」，於是正確地不採用它的數量。
_ID_CACHE = {}
_T2S = None


def _to_sc(name):
    global _T2S
    if _T2S is None:
        try:
            import opencc
            _T2S = opencc.OpenCC("t2s")
        except ImportError:
            print("⚠ 無 opencc → 社群名的繁→簡橋接停用，數量未知的件數會變多", file=sys.stderr)
            _T2S = False
    return _T2S.convert(name) if _T2S else None


def resolve_item_id(con, name):
    if name in _ID_CACHE:
        return _ID_CACHE[name]
    row = con.execute("SELECT id FROM items WHERE name_tc=?", (name,)).fetchone()         or con.execute("SELECT id FROM items WHERE name_sc=?", (name,)).fetchone()
    if not row:
        sc = _to_sc(name)
        if sc:
            row = con.execute("SELECT id FROM items WHERE name_sc=?", (sc,)).fetchone()
    if not row:
        # 只脫中點（「利姆薩·羅敏薩式腹當」vs「利姆薩羅敏薩式腹當」）：純標點差異，
        # 且後面還要過 id 相符那一關，所以不會把兩件不同的東西湊在一起。
        # 兩邊都脫：中點可能只出現在其中一邊（試算表寫「利姆薩羅敏薩式腹當」、台服正名有「·」）
        bare = name.translate({ord(c): None for c in "·・‧"})
        row = con.execute("SELECT id FROM items WHERE REPLACE(REPLACE(name_tc,'·',''),'・','')=?", (bare,)).fetchone()
    _ID_CACHE[name] = row[0] if row else None
    return _ID_CACHE[name]


def write_job_quests():
    """job-quests.json：11 個製作/採集職業的職業任務與「要交什麼」。

    **權威＝台服解包**：所需物品在 Quest 的 `Script{Instruction}=RITEM<n>` → 同序 `Script{Arg}`＝item id
    （實測木工 Lv1 楓木木材／Lv5 楓木方盾／Lv15 犬牙漁槍＋梣木短弓，與遊戲一致）。
    職業繁中名走 monorepo `jobs.json`（DRY 鐵則），物品名/icon 走 item_lookup（同 items.json 的來源）。

    交付數量（`qty`）**不在解包裡**（`CountableNum` 全是 255 哨兵值）→ 來自社群試算表
    `tools/job-quest-qty.json`（`fetch-quest-qty.py` 抓，原始參考是灰機 Wiki＝簡中）。

    **對帳用 item id、不是字串**：試算表的名稱是社群慣用名，可能是簡中直譯或異體字
    （「羅敏薩鳀魚」vs 台服官方「羅敏薩鯷魚」、「公主鱒魚」vs「公主鱒」）。做法是把試算表名
    丟回 `item_lookup` 查 `name_tc`／`name_sc`（＝繁↔簡的權威對照，DRY 鐵則的既有實作）拿到 id，
    **id 與解包 RITEM 的 id 相同才採用那個數量**。查不到或 id 不合就留 `null`＝「數量未知」，
    前端據實標示。刻意不做字面模糊比對——猜錯了採購量整批偏掉而畫面完全正常＝零回饋訊號。
    """
    hdr, rows = read_dump("tc_Quest.csv")
    idx = {h: i for i, h in enumerate(hdr)}
    ins = [i for h, i in idx.items() if h.startswith("Script{Instruction}")]
    arg = [i for h, i in idx.items() if h.startswith("Script{Arg}")]
    cat2abbr = job_by_category()
    # jobs.json 正好也是以**職業縮寫**當鍵（CRP/BSM/…）＝與解包 ClassJobCategory 的旗標欄同一套縮寫
    # ⇒ 兩份資料直接對得上，這裡不需要（也不該有）任何自建對照表。
    # 收哪些職業同樣不寫死：`role` 是 crafter/gatherer 的就收（現況 8+3＝11 職）。
    jobs_meta = json.load(open(JOBS_JSON, encoding="utf-8"))["jobs"]
    qty_src = {}
    qty_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "job-quest-qty.json")
    if os.path.exists(qty_path):
        qty_src = json.load(open(qty_path, encoding="utf-8")).get("jobs", {})
    else:
        print("⚠ 缺 tools/job-quest-qty.json（跑 fetch-quest-qty.py）→ 本輪不帶交付數量", file=sys.stderr)
    con = sqlite3.connect(ITEM_LOOKUP)
    out, miss_item, qty_hit, qty_miss, hq_hit = [], 0, 0, 0, 0
    recipes = json.load(open(os.path.join(OUT, "recipes.json"), encoding="utf-8"))
    recipe_by_item = {}
    for r in recipes:                                  # 成品 item_id → 配方 id（同一物品多配方時取先出現者，與配方表一致）
        if r.get("item_id"):
            recipe_by_item.setdefault(int(r["item_id"]), int(r["id"]))
    # 同一個職業可能有**不只一個**單職 category（實測漁師 2 個：19 主線 21 筆 ＋ 另一組 6 筆）
    # ⇒ 以職業為單位累積、用 quest id 去重，否則同一職業會在 UI 出現兩張表。
    per_job = {}
    for cat, abbr in sorted(cat2abbr.items()):
        job = jobs_meta.get(abbr)
        if not job or job.get("role") not in ("crafter", "gatherer"):
            continue
        quests = per_job.setdefault(abbr, {"job": job["label"], "role": job["role"],
                                           "iconId": job["icon_id"], "quests": []})["quests"]
        for x in rows:
            if x[idx["ClassJobCategory[0]"]] != str(cat):
                continue
            items = []
            for i, j in zip(ins, arg):
                if not x[i].startswith("RITEM") or not x[j].isdigit():
                    continue
                iid = int(x[j])
                r = con.execute("SELECT name_tc, icon FROM items WHERE id=?", (iid,)).fetchone()
                if not r:
                    miss_item += 1
                name = (r and r[0]) or ("#" + str(iid))
                lv = str(int(x[idx["ClassJobLevel[0]"]] or 0))
                sheet_row = qty_src.get(job["label"], {}).get(lv, {}) or {}
                hit = sheet_row.get(name)                       # ① 名稱本來就一樣
                if hit is None:                                 # ② 走 item_lookup 把社群名（可能是簡中/異體）解成 id 再比
                    for sheet_name, v in sheet_row.items():
                        if resolve_item_id(con, sheet_name) == iid:
                            hit = v
                            break
                qty = hit.get("qty") if hit else None
                # 是否要交 HQ：對不上就是 None＝**未知**，不能當成 False
                # （當 False 的話畫面會說「商人有賣」，玩家買了 NQ 才發現交不了）
                need_hq = hit.get("hq") if hit else None
                if qty: qty_hit += 1
                else: qty_miss += 1
                if need_hq: hq_hit += 1
                items.append({"id": iid, "name": name, "icon": (r and r[1]) or None,
                              "recipe": recipe_by_item.get(iid), "qty": qty, "hq": need_hq})
            if not items:                              # 沒有交付物的是解鎖/劇情任務 → 不列（列了是空行噪音）
                continue
            quests.append({"id": int(x[0]), "lv": int(x[idx["ClassJobLevel[0]"]] or 0),
                           "name": x[idx["Name"]], "items": items})
    con.close()
    seen_order = [a for a in jobs_meta if a in per_job]      # 職業順序沿用 jobs.json（＝遊戲職業列序）
    for abbr in seen_order:
        e = per_job[abbr]
        uniq, ids = [], set()
        for q in sorted(e["quests"], key=lambda q: (q["lv"], q["id"])):
            if q["id"] in ids:
                continue
            ids.add(q["id"]); uniq.append(q)
        e["quests"] = uniq
        out.append(e)
    with open(os.path.join(OUT, "job-quests.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("✓ job-quests.json：%d 職 / %d 個任務 / %d 件交付物（%d 件在 item_lookup 查無）" % (
        len(out), sum(len(j["quests"]) for j in out),
        sum(len(q["items"]) for j in out for q in j["quests"]), miss_item))
    print("  交付數量：%d 件對到試算表、%d 件數量未知（名稱不一致或試算表未涵蓋 → 前端標「數量未知」）"
          % (qty_hit, qty_miss))
    print("  要求 HQ：%d 件（來源同上；對不上的是 null＝未知，**不當成不用 HQ**）" % hq_hit)


def write_vendors(quests_path):
    """vendors.json：職業任務會用到的物品 → 有沒有 NPC 賣、多少錢、跟誰買（含地圖座標）。

    **權威＝monorepo `data/item_dict/gil_shop_npc.json`**（解包產出：5642 件商品 → 價格 ＋ 販售 NPC
    的名字/稱號/地圖座標/繁中地名）。DRY 鐵則：禁在這裡自建商人表，也**不要**再從社群試算表補
    ——那份只有 38 筆、且只有縮寫地名；本檔涵蓋 96%（247/256）且價格與 `item_lookup.price_mid` 逐筆一致。
    留兩份就是留一份會漂移的。

    `is_gil_shop` 仍是「有沒有得買」的判準（全覆蓋）；查得到 NPC 的再附上「在哪買」。
    NPC 常有十幾個（通用商人各城都有）→ 只留**帶座標**的前 3 個，其餘用數量帶過。
    範圍限「職業任務交付物 ＋ 它們配方展開到底的所有素材」：全量有上萬筆，對這個分頁沒用。
    """
    jobs = json.load(open(quests_path, encoding="utf-8"))
    recipes = json.load(open(os.path.join(OUT, "recipes.json"), encoding="utf-8"))
    ing = json.load(open(os.path.join(OUT, "ingredients.json"), encoding="utf-8"))
    shop_npc = {}
    shop_path = os.path.join(ROOT, "data", "item_dict", "gil_shop_npc.json")
    if os.path.exists(shop_path):
        shop_npc = json.load(open(shop_path, encoding="utf-8"))
    else:
        print("⚠ 缺 gil_shop_npc.json → 只能標「有沒有得買」，沒有販售地點", file=sys.stderr)
    by_item = {}
    for r in recipes:
        if r.get("item_id"):
            by_item.setdefault(int(r["item_id"]), r)
    need, stack, seen_recipe = set(), [], set()
    for j in jobs:
        for q in j["quests"]:
            for it in q["items"]:
                stack.append(int(it["id"]))
    while stack:                                        # 展開到底層（只為蒐集 id，不算數量）
        iid = stack.pop()
        if iid in need:
            continue
        need.add(iid)
        r = by_item.get(iid)
        if not r or r["id"] in seen_recipe:
            continue
        seen_recipe.add(r["id"])
        for sub, _ in ing.get(str(r["id"]), []):
            stack.append(int(sub))
    con = sqlite3.connect(ITEM_LOOKUP)
    out, withnpc = {}, 0
    for iid in sorted(need):
        row = con.execute("SELECT is_gil_shop, price_mid FROM items WHERE id=?", (iid,)).fetchone()
        entry = shop_npc.get(str(iid))
        if not (row and row[0]) and not entry:
            continue
        e = {"shop": 1}
        price = (entry or {}).get("price") or (row and row[1])
        if price:
            e["price"] = price
        npcs = [n for n in (entry or {}).get("npcs", []) if n.get("zone")]
        if npcs:
            withnpc += 1
            e["npcs"] = [{"npc": n.get("npc"), "title": n.get("title"), "zone": n.get("zone"),
                          "x": n.get("x"), "y": n.get("y")} for n in npcs[:3]]
            if len(npcs) > 3:
                e["more"] = len(npcs) - 3               # 「還有幾處」——不列一長串通用商人
        out[str(iid)] = e
    con.close()
    with open(os.path.join(OUT, "vendors.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("✓ vendors.json：職業任務相關物品 %d 件，其中 %d 件 NPC 有賣、%d 件查得到販售地點"
          % (len(need), len(out), withnpc))


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
            "SELECT id,name_tc,level_item,can_be_hq,icon,ui_category,name_sc FROM items WHERE id=?", (iid,)).fetchone()
        if not row:
            miss += 1
            continue
        items[str(iid)] = {"id": row[0], "name": row[1] or ("#" + str(row[0])),
                           "level": row[2] or 0, "can_be_hq": bool(row[3]), "icon": row[4] or None,
                           "category": row[5] or "",  # 道具種類（ItemUICategory 繁中，item_lookup ui_category）→ UI 配方名副行說明
                           # 簡中名只供**搜尋比對**（顯示一律繁中）：不少人記的是陸服名或從
                           # 簡中攻略複製過來，打簡體查不到會以為工具沒有這個配方。
                           "name_sc": row[6] or ""}
    icon_con.close()
    with open(os.path.join(OUT, "items.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, separators=(",", ":"))
    print("✓ items.json：%d items（含 icon，%d 查無）" % (len(items), miss))

    write_quality_stages(recipes)
    write_level_sync(recipes)
    write_job_quests()
    write_vendors(os.path.join(OUT, "job-quests.json"))


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


if __name__ == "__main__":
    main()
