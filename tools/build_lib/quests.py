# -*- coding: utf-8 -*-
"""職業任務分頁的兩份資料：job-quests.json（任務與交付物）與 vendors.json（誰在賣）。

含台服解包 CSV 讀取（read_dump / job_by_category）與「社群名 → item id」的解析
（_to_sc / resolve_item_id）——後者只服務本檔的交付數量對帳。
"""
import json, os, sqlite3

from .common import DUMP_TC, ITEM_LOOKUP, JOBS_JSON, OUT, ROOT, TOOLS, problem


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
            problem("無 opencc → 社群名的繁→簡橋接停用，數量未知的件數會變多")
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
    qty_path = os.path.join(TOOLS, "job-quest-qty.json")
    if os.path.exists(qty_path):
        qty_src = json.load(open(qty_path, encoding="utf-8")).get("jobs", {})
    else:
        problem("缺 tools/job-quest-qty.json（跑 fetch-quest-qty.py）→ 本輪不帶交付數量")
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

    `is_gil_shop` 仍是「有沒有得買」的判準（全覆蓋）；查得到 NPC 的再附上「跟誰買／在哪買」。
    ⚠ **沒有座標不等於沒有商人**：像「武具商」「雜用商人」這類散佈各城的通用商人，資料裡常只有
    名字與稱號（實測楓木方盾就是這樣）。第一版用 `if n.zone` 過濾＝把它們整批丟掉，畫面上變成
    「本站沒有販售地點資料」，但遊戲裡到處都買得到 → **一律保留，只是把帶座標的排前面**。
    NPC 常有十幾個 → 取前 3 個，其餘用數量帶過。
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
        problem("缺 gil_shop_npc.json → 只能標「有沒有得買」，沒有販售地點")
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
        # 帶座標的排前面（能直接跑過去），但沒座標的照樣留著（名字本身就是線索）
        npcs = sorted((entry or {}).get("npcs", []), key=lambda n: 0 if n.get("zone") else 1)
        if npcs:
            withnpc += 1
            e["npcs"] = [{k: v for k, v in
                          (("npc", n.get("npc")), ("title", n.get("title")), ("zone", n.get("zone")),
                           ("x", n.get("x")), ("y", n.get("y"))) if v is not None} for n in npcs[:3]]
            if len(npcs) > 3:
                e["more"] = len(npcs) - 3               # 「還有幾處」——不列一長串通用商人
        out[str(iid)] = e
    con.close()
    with open(os.path.join(OUT, "vendors.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("✓ vendors.json：職業任務相關物品 %d 件，其中 %d 件 NPC 有賣、%d 件查得到是跟誰買"
          % (len(need), len(out), withnpc))
