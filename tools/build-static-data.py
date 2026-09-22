#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""凍結配方資料的產生器 — 一次性 / 版本更新時跑。

產出 `tools/static-data/*.json`（本 repo 的凍結快照，tracked：tnze 是外部服務，`cached_json` 的設計
本來就是「產出過就重用」），由 `tools/build-data.py` 複製進 `data/`。

**來歷**：2026-09-08 自 `ffxiv-best-craft-main/scripts/build-static-data.py` 接手 —— best-craft 整個
退場（monorepo B-073），而 crafter 原本的 `STATIC_SRC` 指著它的 `public/static-data`，那條依賴會斷。
接手只改三件事：輸出位置改本 repo、monorepo 根與路徑改走 `build_lib/common.py`、兩處 `except: pass`
補窄化／warning（本 repo 鐵則）。演算法逐行沿用，接手當下重跑輸出零 diff 即為證。

來源策略（2026-07-16 換源 zh-TW→zh-CN）：
- recipes / recipe_levels / craft_type / medicine / meals：**tnze zh-CN 凍結**（簡中源與國際版同步；
  zh-TW 源停更於 7.1 世代 max rlv 720，缺 7.2+ 約 2200 筆）→ 步驟⑦ 以 item_lookup 繁中化。
- items / ingredients：**monorepo item_lookup.sqlite**（by-id，免逐筆爬 ~萬次）— 附 id 對齊 spot-check（與 tnze 比對，不齊即中止）。
- 顯示名繁中權威＝item_lookup `name_tc`（datamining 官方繁中），**非 OpenCC 機轉**；job 名用 JOB_TC 固定對照（繁中服正名）。

跨機：monorepo 根與輸出目錄一律取自 `build_lib/common.py`（env `FFXIV_PROJECT_ROOT` 可覆寫，其餘由
檔案位置上溯推導），**不得寫死磁碟機代號**。用 py -3.11 跑（穩定 sqlite3）。
一次性離線腳本 → 受 monorepo `scripts/` 豁免（免 SESSION/bounded_set）；`except: pass` 禁令仍適用。
"""
import json, os, sqlite3, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

# 與 build-data.py 同理：本檔是被直接執行的腳本、檔名帶連字號不能被 import ⇒ tools/ 不在 sys.path 上。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_lib.common import (  # noqa: E402（路徑要先接上）
    ITEM_LOOKUP as DICT,
    STATIC_SRC as OUT,
    validate_recipe_bundle,
)

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError): pass  # best-effort 編碼設定（窄 except，同 build_lib/common.py）

LANG = 'zh-CN'   # 來源語系（簡中源跟版國際服；輸出名稱由⑦繁中化，_meta.lang 仍標 zh-TW）
BASE = 'https://tnze.yyyy.games/api/datasource/' + LANG + '/'
# 繁中服 8 製作職正名（index = craft_type id；來源＝原 zh-TW craft_type，對齊 AGENTS 鐵則職業名）
JOB_TC = ['木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調']
# DICT（monorepo item_lookup.sqlite）與 OUT（tools/static-data）＝ build_lib/common.py 的
# ITEM_LOOKUP／STATIC_SRC：產生端與消費端（build-data.py 的 copy_static_data）指同一個常數，
# 兩邊各寫一份路徑遲早會漂移。
DELAY = 0.15   # 禮貌間隔，避免灌爆 tnze

def get(path, tries=3):
    url = BASE + path
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'ffxiv-tw-tools/static-data-build'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if i == tries - 1: raise
        except Exception:
            if i == tries - 1: raise
        time.sleep(0.5 * (i + 1))
    return None

def _validate_recipe_cache(data):
    if not isinstance(data, list) or not data:
        raise ValueError('recipes cache 必須是非空陣列')
    seen = set()
    for index, recipe in enumerate(data):
        if not isinstance(recipe, dict):
            raise ValueError('recipes cache 第 %d 筆不是物件' % index)
        rid = recipe.get('id')
        if isinstance(rid, bool) or not isinstance(rid, int) or rid <= 0:
            raise ValueError('recipes cache 第 %d 筆 id 無效：%r' % (index, rid))
        if recipe.get('rlv') is None:
            raise ValueError('recipes cache recipe %s 缺 rlv' % rid)
        try:
            duplicate = rid in seen
            hash(recipe['rlv'])
        except (KeyError, TypeError) as e:
            raise ValueError('recipes cache recipe %s 的 rlv 無效' % rid) from e
        if duplicate:
            raise ValueError('recipes cache recipe id 重複：%s' % rid)
        seen.add(rid)


def _validate_recipe_levels_cache(data, required_rlvs=None):
    if not isinstance(data, dict) or not data:
        raise ValueError('recipe_levels cache 必須是非空物件')
    for key, value in data.items():
        if not isinstance(value, dict) or not value:
            raise ValueError('recipe_levels cache %s 不是非空物件' % key)
    if required_rlvs:
        missing = sorted(str(rlv) for rlv in required_rlvs if str(rlv) not in data)
        if missing:
            raise ValueError('recipe_levels cache 缺 rlv：%s' % ', '.join(missing))


def _validate_ingredients_cache(data, required_recipe_ids=None):
    if not isinstance(data, dict) or not data:
        raise ValueError('ingredients cache 必須是非空物件')
    for recipe_id, rows in data.items():
        if not isinstance(rows, list) or not rows:
            raise ValueError('ingredients cache recipe %s 的食材不是非空陣列' % recipe_id)
        for index, pair in enumerate(rows):
            if (not isinstance(pair, list) or len(pair) != 2
                    or any(isinstance(value, bool) or not isinstance(value, int) or value <= 0
                           for value in pair)):
                raise ValueError('ingredients cache recipe %s 第 %d 筆形狀無效' % (recipe_id, index))
    if required_recipe_ids:
        missing = sorted(str(rid) for rid in required_recipe_ids if str(rid) not in data)
        if missing:
            raise ValueError('ingredients cache 缺 recipe：%s' % ', '.join(missing))

def _source_list(name, data, allow_empty=False):
    if not isinstance(data, list) or (not allow_empty and not data):
        state = '非空陣列' if not allow_empty else '陣列'
        raise ValueError('%s source 必須是%s' % (name, state))
    return data


def crawl_recipes():
    recipes, page = [], 0
    while True:
        d = get('recipe_table?page_id=%d&search_name=%%25%%25' % page)
        if not isinstance(d, dict):
            raise ValueError('recipe page %d 回應為空或格式無效' % (page + 1))
        data = d.get('data')
        if not isinstance(data, list) or not data:
            raise ValueError('recipe page %d 回應沒有資料' % (page + 1))
        total = d.get('p') or 1
        if not isinstance(total, int) or total < 1 or page >= total:
            raise ValueError('recipe page %d 的頁數欄位無效：%r' % (page + 1, total))
        recipes.extend(data)
        print('  recipe page %d/%d (+%d)' % (page + 1, total, len(data)))
        page += 1
        if page >= total:
            break
        time.sleep(DELAY)
    return recipes


def crawl_rlv(rlvs):
    out = {}
    for i, rlv in enumerate(sorted(rlvs)):
        d = get('recipe_level_table?rlv=%d' % rlv)
        if not isinstance(d, dict) or not d:
            raise ValueError('recipe level %s 回應為空或格式無效' % rlv)
        d.setdefault('id', rlv)
        d.setdefault('stars', 0)
        out[str(rlv)] = d
        if i % 50 == 0: print('  rlv %d/%d' % (i, len(rlvs)))
        time.sleep(DELAY)
    return out


def cached_json(fn, producer, validator):
    """讀取並驗證既有快取；新資料只回傳，待整包驗證後由 main 發布。"""
    path = os.path.join(OUT, fn)
    if os.path.exists(path):
        print('  (reuse cache %s)' % fn)
        try:
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
        except (OSError, ValueError) as e:
            raise ValueError('無效 cache %s：%s' % (fn, e)) from e
        validator(data)
        return data
    data = producer()
    validator(data)
    return data


def main():
    os.makedirs(OUT, exist_ok=True)
    if not os.path.exists(DICT):
        print('✗ 找不到 item_lookup.sqlite：' + DICT, file=sys.stderr); sys.exit(1)
    conn = sqlite3.connect(DICT)
    try:
        _build_snapshot(conn)
    finally:
        conn.close()


def _build_snapshot(conn):

    print('① craft_type / medicine / meals')
    craft_type = _source_list('craft_type', get('craft_type'))
    medicine = _source_list('medicine_table', get('medicine_table'), allow_empty=True)
    meals = _source_list('meals_table', get('meals_table'), allow_empty=True)

    print('② recipes（tnze recipe_table 全頁）')
    recipes = cached_json('recipes.json', crawl_recipes, _validate_recipe_cache)
    print('   → %d 配方' % len(recipes))

    print('③ recipe_levels（distinct rlv，含 solver 5 核心欄位）')
    rlvs = {r['rlv'] for r in recipes}
    recipe_levels = cached_json(
        'recipe_levels.json',
        lambda: crawl_rlv(rlvs),
        lambda data: _validate_recipe_levels_cache(data, rlvs),
    )
    print('   → %d rlv' % len(recipe_levels))

    # id 對齊 spot-check：monorepo recipes.ingredients(by recipe_id) vs tnze recipes_ingredientions
    print('④ id 對齊 spot-check（monorepo ↔ tnze ingredients）')
    sample = [r['id'] for r in recipes[:3] if r.get('id')]
    for rid in sample:
        tn = get('recipes_ingredientions?recipe_id=%d' % rid)
        if tn is None:
            raise ValueError('recipe %s 的 tnze ingredients 回應為空' % rid)
        tn_norm = sorted([[int(a), int(b)] for a, b in tn])
        row = conn.execute('SELECT ingredients FROM recipes WHERE recipe_id=?', (rid,)).fetchone()
        mono = sorted(json.loads(row[0])) if row and row[0] else []
        mono = sorted([[int(a), int(b)] for a, b in mono])
        ok = tn_norm == mono
        print('   recipe %d: tnze=%s mono=%s %s' % (rid, tn_norm, mono, '✓' if ok else '✗ 不齊!'))
        if not ok:
            print('✗ id 不對齊 — 改為全程從 tnze 抓 ingredients（本腳本需改）', file=sys.stderr); sys.exit(1)

    print('⑤ ingredients（monorepo recipes.ingredients；monorepo 缺的向 tnze 補爬）')
    # 注意：item_lookup.recipes 表停更於 7.1（max 36059），新配方素材必須向 tnze 補爬（純 id，語言無關）
    def build_ingredients():
        out = {}
        for rid, ing in conn.execute('SELECT recipe_id, ingredients FROM recipes').fetchall():
            if ing:
                try:
                    parsed = json.loads(ing)
                    if parsed:
                        out[str(rid)] = [[int(a), int(b)] for a, b in parsed]
                except (ValueError, TypeError) as e:  # 壞掉的 ingredients JSON：跳過該筆但要看得見
                    print('   ⚠ recipe %s 的 ingredients 解析失敗（略過）：%s' % (rid, e), file=sys.stderr)
        # 只留 tnze 配方有用到的（省體積）
        needed_rids = {str(r['id']) for r in recipes}
        out = {k: v for k, v in out.items() if k in needed_rids}
        missing = sorted(int(k) for k in needed_rids - set(out))
        print('   monorepo 覆蓋 %d/%d；向 tnze 補爬 %d 筆' % (len(out), len(needed_rids), len(missing)))
        def fetch_one(rid):
            tn = get('recipes_ingredientions?recipe_id=%d' % rid)
            if not isinstance(tn, list) or not tn:
                raise ValueError('recipe %s 的 tnze ingredients 回應為空或格式無效' % rid)
            return rid, sorted([[int(a), int(b)] for a, b in tn])
        done = 0
        with ThreadPoolExecutor(max_workers=8) as ex:  # 並行先例＝monorepo dump_recipes.py Phase R2（同 host）
            for rid, val in ex.map(fetch_one, missing):
                out[str(rid)] = val
                done += 1
                if done % 200 == 0: print('   ingredients 補爬 %d/%d' % (done, len(missing)))
        return out
    ingredients = cached_json(
        'ingredients.json',
        build_ingredients,
        lambda data: _validate_ingredients_cache(data, {r['id'] for r in recipes}),
    )
    print('   → %d 配方有食材（covered tnze 配方）' % len(ingredients))
    validate_recipe_bundle(recipes, recipe_levels, ingredients)

    print('⑥ items（monorepo items by id：配方產物 + 所有食材）')
    item_ids = set()
    for r in recipes:
        if r.get('item_id') is not None: item_ids.add(int(r['item_id']))
    for v in ingredients.values():
        for iid, _ in v: item_ids.add(int(iid))
    items = {}
    missing_item_ids = []
    for iid in item_ids:
        row = conn.execute('SELECT id,name_tc,level_item,can_be_hq,is_collectable FROM items WHERE id=?', (iid,)).fetchone()
        if not row:
            missing_item_ids.append(iid)
            continue
        items[str(iid)] = {
            'id': row[0], 'name': row[1] or ('#' + str(row[0])),
            'level': row[2] or 0,
            'can_be_hq': bool(row[3]), 'is_collectable': bool(row[4]), 'always_collectable': False,
        }
    print('   → %d items（%d 個 id 在 monorepo 查無）' % (len(items), len(missing_item_ids)))
    if missing_item_ids:
        raise ValueError('item_lookup 缺 referenced item row：%s' % sorted(missing_item_ids))

    # ⑦ 繁中化：zh-CN 源顯示名 → item_lookup name_tc（idempotent，cache 重跑安全）
    print('⑦ 繁中化（權威 = item_lookup name_tc；job = JOB_TC 固定對照）')
    job_map = {c['name']: JOB_TC[c['id']] for c in craft_type
               if c.get('id') is not None and 0 <= c['id'] < len(JOB_TC)}
    for c in craft_type:
        if c.get('id') is not None and 0 <= c['id'] < len(JOB_TC):
            c['name'] = JOB_TC[c['id']]
    name_miss, job_bad = [], set()
    for r in recipes:
        iid = r.get('item_id')
        row = conn.execute('SELECT name_tc FROM items WHERE id=?', (int(iid),)).fetchone() if iid is not None else None
        if row and row[0]:
            r['item_name'] = row[0]
        else:
            name_miss.append((iid, r.get('item_name')))
        j = r.get('job')
        r['job'] = job_map.get(j, j)
        if r['job'] not in JOB_TC:
            job_bad.add(j)
    if job_bad:
        print('✗ 職業名對照不到（craft_type 對照 drift，需修 JOB_TC）：%s' % sorted(job_bad), file=sys.stderr)
        sys.exit(1)
    def tc_by_sc(name):
        row = conn.execute("SELECT name_tc FROM items WHERE name_sc=? AND name_tc!='' LIMIT 1", (name,)).fetchone()
        return row[0] if row else None
    fm_miss = []
    for arr in (meals, medicine):
        for m in arr:
            tc = tc_by_sc(m.get('name', ''))
            if tc:
                m['name'] = tc
            else:
                fm_miss.append(m.get('name'))
    print('   recipes 繁中名 %d/%d（查無 %d）；食藥查無 %d' % (
        len(recipes) - len(name_miss), len(recipes), len(name_miss), len(fm_miss)))
    for x in name_miss[:10]:
        print('   ⚠ item_name 查無（保留來源名）:', x)
    for x in fm_miss[:10]:
        print('   ⚠ 食藥查無（保留來源名）:', x)

    meta = {'source': 'tnze.yyyy.games zh-CN(recipes/rlv/craft_type/medicine/meals, 繁中化 via item_lookup) + item_dict(items/ingredients)',
            'lang': 'zh-TW', 'recipes': len(recipes), 'rlv': len(recipe_levels), 'items': len(items),
            'ingredients': len(ingredients), 'craftType': len(craft_type)}

    def w(fn, obj):
        with open(os.path.join(OUT, fn), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    w('craft_type.json', craft_type)
    w('recipes.json', recipes)
    w('recipe_levels.json', recipe_levels)
    w('ingredients.json', ingredients)
    w('items.json', items)
    w('medicine.json', medicine)
    w('meals.json', meals)
    w('_meta.json', meta)

    print('\n✓ 輸出 → ' + OUT)
    print('  ' + json.dumps(meta, ensure_ascii=False))
    # 抽驗一筆 rlv 的 5 核心欄位
    if recipe_levels:
        any_rlv = next(iter(recipe_levels.values()))
        need = ['progress_divider', 'quality_divider', 'progress_modifier', 'quality_modifier', 'conditions_flag']
        have = [k for k in need if k in any_rlv]
        print('  solver 5 核心欄位（rlv %s）：%s %s' % (any_rlv.get('id'), have, '✓' if len(have) == 5 else '✗ 缺!'))

if __name__ == '__main__':
    main()
