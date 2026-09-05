# -*- coding: utf-8 -*-
"""meals/medicine 的 icon + item id 補欄（best-craft 凍結資料只有 name/level/加成，無圖示）。"""
import json, os, sqlite3

from .common import ITEM_LOOKUP, OUT, problem


def enrich_consumables():
    """meals/medicine 補 icon + item id（best-craft 凍結資料只有 name/level/加成，無圖示）。

    比對鍵＝繁中名（item_lookup.name_tc）；`level` 欄已驗證 == items.level_item（＝物品品級），故不覆寫。
    對 OUT 內的檔就地加欄，可重複執行（idempotent）。
    """
    con = sqlite3.connect(ITEM_LOOKUP)
    for fn in ("meals.json", "medicine.json"):
        p = os.path.join(OUT, fn)
        if not os.path.exists(p):
            problem("缺 " + p + "（先跑完整 build-data.py）"); continue
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
