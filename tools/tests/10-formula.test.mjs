// tools/tests/10-formula.test.mjs — 公式面 golden：computeSettings／effectiveStats／hqPercent／recipeMaxes（T0〜T5、T22）
// 由 tools/test-formulas.mjs 依檔名序 import 跑；斷言計數器與共用 fixture 都在 ./_harness.mjs。
import { sandbox, T, check, eq, eqObj, rlv640, recipe100, gear, gearSpec, setInputs } from './_harness.mjs';

// ===== T0：載入 smoke =====
check('app.js 純函式導出成功（computeSettings 為函式）', typeof T.computeSettings === 'function');
check('effectiveStats/hqPercent/recipeMaxes 均為函式',
  typeof T.effectiveStats === 'function' && typeof T.hqPercent === 'function' && typeof T.recipeMaxes === 'function');

// ===== T1：computeSettings baseline（spec §4 golden：base_progress 250、base_quality 266）=====
{
  setInputs({});
  const s = T.computeSettings(recipe100, rlv640, gear);
  eqObj('T1 computeSettings baseline 全欄 golden', s, {
    max_cp: 600, max_durability: 70, max_progress: 4400, max_quality: 9000,
    base_progress: 250, base_quality: 266, job_level: 90,
    use_manipulation: true, use_heart_and_soul: false, use_quick_innovation: false,
    use_trained_eye: false, adversarial: false,
    backload_progress: false, stellar_steady_hand_charges: 0,
    target_quality: 9000, initial_quality: 0,
  });
}

// ===== T2：M1 專家之證 → 作業/加工 +20、CP +15（本輪修復；金鎖）=====
{
  setInputs({});
  const s = T.computeSettings(recipe100, rlv640, gearSpec);
  eq('T2 專家之證 CP +15（max_cp 600→615）', s.max_cp, 615);
  eq('T2 專家之證 作業 +20（base_progress 250→251）', s.base_progress, 251);
  eq('T2 專家之證 加工 +20（base_quality 266→267）', s.base_quality, 267);
  // effectiveStats 直驗 +20/+20/+15
  eqObj('T2 effectiveStats(+20/+20/+15)', T.effectiveStats(gearSpec), { cms: 4068, ctrl: 4000, cp: 615 });
}
{
  setInputs({});
  eqObj('T2b effectiveStats 無專家＝原值', T.effectiveStats(gear), { cms: 4048, ctrl: 3980, cp: 600 });
}

// ===== T22：effectiveStats 食物／藥水加成 golden（百分比、上限、base 與專家之證順序）=====
{
  const oldCraftConsumable = sandbox.CraftConsumable;
  let fixture = { food: null, potion: null };
  sandbox.CraftConsumable = { get: (kind) => fixture[kind] || null };
  try {
    setInputs({});
    fixture = { food: { cm: 7, cm_max: 999 }, potion: null };
    eqObj('T22 百分比加成取 floor', T.effectiveStats(gear),
      { cms: 4048 + Math.floor(4048 * 7 / 100), ctrl: 3980, cp: 600 });

    fixture = { food: { cm: 10, cm_max: 5 }, potion: null };
    eqObj('T22 硬上限小於百分比結果時取上限', T.effectiveStats(gear),
      { cms: 4048 + 5, ctrl: 3980, cp: 600 });

    fixture = { food: { cm: 3, cm_max: 999 }, potion: { cm: 4, cm_max: 999 } };
    eqObj('T22 食物與藥水都以原始 base 計算', T.effectiveStats(gear),
      { cms: 4048 + Math.floor(4048 * 3 / 100) + Math.floor(4048 * 4 / 100), ctrl: 3980, cp: 600 });

    fixture = { food: { cm: 10, cm_max: 999, ct: 10, ct_max: 999, cp: 10, cp_max: 999 }, potion: null };
    eqObj('T22 專家之證先疊入食藥加成 base', T.effectiveStats(gearSpec),
      {
        cms: 4068 + Math.floor(4068 * 10 / 100),
        ctrl: 4000 + Math.floor(4000 * 10 / 100),
        cp: 615 + Math.floor(615 * 10 / 100),
      });
  } finally {
    sandbox.CraftConsumable = oldCraftConsumable;
  }
}

// ===== T3：computeSettings 模式/技能閘 golden =====
{
  setInputs({ mode: 'nq' });                                   // NQ 模式 → target_quality 0
  eq('T3 NQ 模式 target_quality=0', T.computeSettings(recipe100, rlv640, gear).target_quality, 0);
}
{
  setInputs({ target: '5000' });                               // 指定目標品質（< max）
  eq('T3 指定 target=5000 帶入', T.computeSettings(recipe100, rlv640, gear).target_quality, 5000);
  setInputs({ target: '99999' });                              // 超上限 → clamp 到 max_quality
  eq('T3 target 超上限 clamp 到 max_quality', T.computeSettings(recipe100, rlv640, gear).target_quality, 9000);
}
{
  setInputs({});
  const lv100 = { ...gear, level: 100 };                       // 等級 ≥ rlv+10 → 精修之眼開
  eq('T3 use_trained_eye（lv100 ≥ 90+10）', T.computeSettings(recipe100, rlv640, lv100).use_trained_eye, true);
  const expert = { ...recipe100, is_expert: true };
  setInputs({ adv: true });
  const se = T.computeSettings(expert, rlv640, lv100);
  eq('T3 高難度配方 → use_trained_eye 強制關', se.use_trained_eye, false);
  eq('T3 高難度配方 → adversarial 強制關', se.adversarial, false);
}

// ===== T4：hqPercent 斷點抽樣（品質% → HQ%；含邊界 100/99/98、5/2、0、超上限、maxQ=0）=====
{
  const M = 9000;
  eq('T4 hqPercent p=100 → 100', T.hqPercent(9000, M), 100);
  eq('T4 hqPercent p=99 → 98（邊界）', T.hqPercent(8910, M), 98);
  eq('T4 hqPercent p=98 → 96（邊界）', T.hqPercent(8820, M), 96);
  eq('T4 hqPercent p=75 → 47', T.hqPercent(6750, M), 47);
  eq('T4 hqPercent p=50 → 15', T.hqPercent(4500, M), 15);
  eq('T4 hqPercent p=5 → 2（邊界）', T.hqPercent(450, M), 2);
  eq('T4 hqPercent p=2 → null（表 1-4% 缺口）', T.hqPercent(180, M), null);
  eq('T4 hqPercent p=0 → 1', T.hqPercent(0, M), 1);
  eq('T4 hqPercent 品質溢出上限 → 夾到 100', T.hqPercent(9500, M), 100);
  eq('T4 hqPercent maxQuality=0 → null（守衛）', T.hqPercent(500, 0), null);
}

// ===== T5：recipeMaxes 三上限（顯示與求解共用算式；floor）=====
{
  eqObj('T5 recipeMaxes factor=100', T.recipeMaxes(recipe100, rlv640),
    { max_progress: 4400, max_quality: 9000, max_durability: 70 });
  const rf = { difficulty_factor: 50, quality_factor: 90, durability_factor: 100 };
  eqObj('T5 recipeMaxes 非整除 → floor', T.recipeMaxes(rf, { difficulty: 4401, quality: 9005, durability: 70 }),
    { max_progress: 2200, max_quality: 8104, max_durability: 70 });
}
