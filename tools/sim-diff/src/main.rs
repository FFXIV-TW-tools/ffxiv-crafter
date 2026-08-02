// 兩顆獨立實作的 FFXIV 製作模擬器差分測試。
//
//   A = raphael-sim v0.26.2  →  ffxiv-crafter 線上實際在跑的引擎
//   B = ffxiv-crafting 7.4.5 →  BestCraft(Tnze) 用的引擎
//
// 隨機走訪合法技能序列，每一步比對 進展/品質/耐久/CP 與「這個技能可不可以放」。
// 已知的表示差異先正規化掉，避免製造假 finding：
//   * B 會把 progress/quality 夾在上限，A 累加原始值 → 比對前兩邊都夾。
//   * B 的 buff 剩餘回合是「含本回合」的計數，A 是回合數 → 不比 buff 欄，只比可觀測狀態。

use ffxiv_crafting as tz;
use raphael_sim as rp;

// ---------- PRNG（固定種子，可重現） ----------
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
    fn range(&mut self, lo: u32, hi: u32) -> u32 {
        lo + (self.next() % u64::from(hi - lo + 1)) as u32
    }
}

// ---------- 技能對應表 ----------
fn pairs() -> Vec<(&'static str, rp::Action, tz::Actions)> {
    use rp::Action as A;
    use tz::Actions as T;
    vec![
        ("BasicSynthesis", A::BasicSynthesis, T::BasicSynthesis),
        ("BasicTouch", A::BasicTouch, T::BasicTouch),
        ("MasterMend", A::MasterMend, T::MastersMend),
        ("Observe", A::Observe, T::Observe),
        ("TricksOfTheTrade", A::TricksOfTheTrade, T::TricksOfTheTrade),
        ("WasteNot", A::WasteNot, T::WasteNot),
        ("Veneration", A::Veneration, T::Veneration),
        ("StandardTouch", A::StandardTouch, T::StandardTouch),
        ("GreatStrides", A::GreatStrides, T::GreatStrides),
        ("Innovation", A::Innovation, T::Innovation),
        ("WasteNot2", A::WasteNot2, T::WasteNotII),
        ("ByregotsBlessing", A::ByregotsBlessing, T::ByregotsBlessing),
        ("PreciseTouch", A::PreciseTouch, T::PreciseTouch),
        ("MuscleMemory", A::MuscleMemory, T::MuscleMemory),
        ("CarefulSynthesis", A::CarefulSynthesis, T::CarefulSynthesis),
        ("Manipulation", A::Manipulation, T::Manipulation),
        ("PrudentTouch", A::PrudentTouch, T::PrudentTouch),
        ("AdvancedTouch", A::AdvancedTouch, T::AdvancedTouch),
        ("Reflect", A::Reflect, T::Reflect),
        ("PreparatoryTouch", A::PreparatoryTouch, T::PreparatoryTouch),
        ("Groundwork", A::Groundwork, T::Groundwork),
        ("DelicateSynthesis", A::DelicateSynthesis, T::DelicateSynthesis),
        ("IntensiveSynthesis", A::IntensiveSynthesis, T::IntensiveSynthesis),
        ("TrainedEye", A::TrainedEye, T::TrainedEye),
        ("HeartAndSoul", A::HeartAndSoul, T::HeartAndSoul),
        ("PrudentSynthesis", A::PrudentSynthesis, T::PrudentSynthesis),
        ("TrainedFinesse", A::TrainedFinesse, T::TrainedFinesse),
        ("RefinedTouch", A::RefinedTouch, T::RefinedTouch),
        ("QuickInnovation", A::QuickInnovation, T::QuickInnovation),
        ("ImmaculateMend", A::ImmaculateMend, T::ImmaculateMend),
        ("TrainedPerfection", A::TrainedPerfection, T::TrainedPerfection),
        ("StellarSteadyHand", A::StellarSteadyHand, T::StellarSteadyHand),
        ("RapidSynthesis", A::RapidSynthesis, T::RapidSynthesis),
        ("HastyTouch", A::HastyTouch, T::HastyTouch),
        ("DaringTouch", A::DaringTouch, T::DaringTouch),
    ]
}

// 真實遊戲的 rlv 列（取自 ffxiv-crafter data/recipe_levels.json 的代表列）
// id, class_job_level, difficulty, quality, progress_div, quality_div, progress_mod, quality_mod, durability
const RLVS: [(i32, u8, u16, u32, u8, u8, u8, u8, u16); 8] = [
    (690, 100, 6600, 12000, 170, 150, 90, 75, 80),
    (685, 100, 6300, 11400, 167, 147, 90, 80, 80),
    (640, 90, 4400, 8600, 130, 115, 80, 70, 70),
    (620, 90, 4400, 8600, 130, 115, 80, 70, 70),
    (560, 90, 3500, 7200, 130, 115, 80, 70, 70),
    (480, 80, 2800, 8500, 110, 90, 80, 70, 70),
    (430, 80, 2600, 7400, 110, 90, 80, 70, 70),
    (290, 70, 1900, 6200, 90, 80, 100, 100, 70),
];

#[derive(Default)]
struct Diffs {
    // action -> (kind -> (count, 第一個例子))
    rows: std::collections::BTreeMap<String, std::collections::BTreeMap<String, (u64, String)>>,
}
impl Diffs {
    fn add(&mut self, action: &str, kind: &str, example: String) {
        let e = self
            .rows
            .entry(action.to_string())
            .or_default()
            .entry(kind.to_string())
            .or_insert((0, example));
        e.0 += 1;
    }
}

fn run_config(seed: u64, iters: u32, stellar_charges: u8, diffs: &mut Diffs, stats: &mut (u64, u64)) {
    let map = pairs();
    let mut rng = Rng(seed);

    for _ in 0..iters {
        let r = RLVS[rng.below(RLVS.len())];
        let rlv = tz::RecipeLevel {
            id: r.0,
            class_job_level: r.1,
            stars: 0,
            suggested_craftsmanship: 0,
            difficulty: r.2,
            quality: r.3,
            progress_divider: r.4,
            quality_divider: r.5,
            progress_modifier: r.6,
            quality_modifier: r.7,
            durability: r.8,
            conditions_flag: 15,
        };
        let df = [50u16, 100, 130, 150][rng.below(4)];
        let qf = [80u16, 100, 150][rng.below(3)];
        let du = [67u16, 100][rng.below(2)];
        let recipe = tz::Recipe::new(rlv, df, qf, du);

        let level = rng.range(60, 100) as u8;
        let attrs = tz::Attributes {
            level,
            craftsmanship: rng.range(1500, 5600) as i32,
            control: rng.range(1500, 5600) as i32,
            craft_points: rng.range(300, 800) as i32,
        };

        let mut b = tz::Status::new(attrs, recipe);
        // A 的 base_progress / base_quality 用與 B 完全相同的算式餵進去（這一層是 ffxiv-crafter 的 JS 在算）
        let settings = rp::Settings {
            max_cp: attrs.craft_points as u16,
            max_durability: recipe.durability,
            max_progress: recipe.difficulty,
            max_quality: recipe.quality as u16,
            base_progress: b.caches.base_synth as u16,
            base_quality: b.caches.base_touch as u16,
            job_level: level,
            allowed_actions: rp::ActionMask::all(),
            adversarial: false,
            backload_progress: false,
            stellar_steady_hand_charges: stellar_charges,
        };
        let mut a = rp::SimulationState::new(&settings);

        for _step in 0..40 {
            if b.is_finished() {
                break;
            }
            let idx = rng.below(map.len());
            let (name, ra, ta) = map[idx];

            let a_res = a.use_action(ra, rp::Condition::Normal, &settings);
            let b_ok = b.is_action_allowed(ta).is_ok();

            match (&a_res, b_ok) {
                (Ok(_), false) => {
                    // A 允許、B 禁止
                    diffs.add(
                        name,
                        "legality: A允許/B禁止",
                        format!(
                            "lv{} cms{} ctrl{} cp{} rlv{} | B理由 {:?}",
                            level,
                            attrs.craftsmanship,
                            attrs.control,
                            attrs.craft_points,
                            r.0,
                            b.is_action_allowed(ta).err()
                        ),
                    );
                    continue;
                }
                (Err(e), true) => {
                    diffs.add(
                        name,
                        "legality: A禁止/B允許",
                        format!(
                            "lv{} cms{} ctrl{} cp{} rlv{} | A理由 {:?}",
                            level, attrs.craftsmanship, attrs.control, attrs.craft_points, r.0, e
                        ),
                    );
                    continue;
                }
                (Err(_), false) => continue, // 兩邊都禁止：一致
                (Ok(_), true) => {}
            }

            let na = a_res.unwrap();
            b.cast_action(ta);
            stats.0 += 1;

            let a_prog = (na.progress).min(u32::from(recipe.difficulty));
            let b_prog = u32::from(b.progress);
            let a_qual = (na.quality).min(recipe.quality);
            let b_qual = b.quality;

            let mut bad = false;
            if a_prog != b_prog {
                diffs.add(name, "進展", format!("A={} B={} (lv{} rlv{} cms{})", a_prog, b_prog, level, r.0, attrs.craftsmanship));
                bad = true;
            }
            if a_qual != b_qual {
                diffs.add(name, "品質", format!("A={} B={} (lv{} rlv{} ctrl{})", a_qual, b_qual, level, r.0, attrs.control));
                bad = true;
            }
            if na.durability != b.durability {
                // 分類：這一步之後製作是否已經結束（進展滿 or 耐久歸零）——
                // 結束後的耐久沒有任何後續影響，與「製作中途就對不上」是不同性質的分歧。
                let terminal = a_prog >= u32::from(recipe.difficulty) || na.durability == 0 || b.durability == 0;
                let manip = b.buffs.manipulation > 0;
                diffs.add(
                    name,
                    if terminal { "耐久（已完工/耐久歸零後）" } else { "耐久（製作進行中）" },
                    format!(
                        "A={} B={} (lv{} rlv{} 掌握={} 進展={}/{})",
                        na.durability, b.durability, level, r.0, manip, a_prog, recipe.difficulty
                    ),
                );
                bad = true;
            }
            if u32::from(na.cp) != b.craft_points as u32 {
                diffs.add(name, "CP", format!("A={} B={} (lv{} rlv{})", na.cp, b.craft_points, level, r.0));
                bad = true;
            }
            if bad {
                stats.1 += 1;
                break; // 狀態已分歧，後續步驟沒有比較意義
            }
            a = na;
        }
    }
}

// ---------- 已知差異允許清單 ----------
// 每一條都經查證、且知道為什麼可以放行。**清單外的任何差異一律讓本閘失敗**——
// 新增條目前必須先查遊戲客戶端判誰對，不要為了讓閘變綠而往這裡加。
const ALLOWED: &[(&str, &str, &str)] = &[
    // (action, kind, 為什麼可以放行)
    ("TrainedEye", "耐久（製作進行中）",
     "上游 raphael 把耐久寫死 10、遊戲實際 0（判準見 AGENTS 開發注意）。\
      我方已在 wasm/src/lib.rs 的 replay()／solve_input() 補償，本閘測的是未補償的裸引擎故仍會報。\
      ⚠ 這條哪天消失＝上游修好了＝該移除我方 workaround。"),
    ("BasicSynthesis", "耐久（已完工/耐久歸零後）", TERMINAL_MANIP),
    ("CarefulSynthesis", "耐久（已完工/耐久歸零後）", TERMINAL_MANIP),
    ("DelicateSynthesis", "耐久（已完工/耐久歸零後）", TERMINAL_MANIP),
    ("Groundwork", "耐久（已完工/耐久歸零後）", TERMINAL_MANIP),
    ("IntensiveSynthesis", "耐久（已完工/耐久歸零後）", TERMINAL_MANIP),
    ("PrudentSynthesis", "耐久（已完工/耐久歸零後）", TERMINAL_MANIP),
    ("HastyTouch", "legality: A禁止/B允許", UNRELIABLE),
    ("RapidSynthesis", "legality: A禁止/B允許", UNRELIABLE),
    // 冒進(DaringTouch) 刻意不列：它還要求「倉促成功」給的良機效果，隨機走訪抽不到，
    // 列了只會每輪印一則「這輪沒出現」的假警告。真的出現＝值得看一眼，讓它落到清單外。
    ("RefinedTouch", "legality: A禁止/B允許",
     "raphael 要求必接在加工之後；遊戲與 Teamcraft 允許單放（只是少一層內靜）。\
      raphael 比遊戲嚴格＝只會少考慮選項，不會產出非法技能，故放行。"),
    ("StellarSteadyHand", "legality: A允許/B禁止",
     "可用次數兩邊不同（raphael 3 次 / Tnze 1 次）。台服尚無此技能（見 BACKLOG B-018），\
      且我方 stellar_steady_hand_charges 寫死 0 ⇒ 打不到。台服上 7.4 前必須重查。"),
    ("TrainedEye", "legality: A允許/B禁止",
     "raphael 不在引擎內檢查「配方需低 10 級」，靠呼叫端的 action mask。\
      我方 app.js 的 use_trained_eye 已做這個閘（level >= class_job_level + 10），故打不到。"),
];
const TERMINAL_MANIP: &str =
    "掌握生效時，raphael 在製作完成那一步提早 return、跳過 +5 回耐久。\
     全部發生在製作已結束（進展滿或耐久 0）之後，對結果與後續步驟皆無影響。";
const UNRELIABLE: &str =
    "raphael 刻意排除隨機成功率技能（除非群星穩定生效），不產生賭運氣的巨集；Tnze 則以成功建模。\
     這是設計取捨不是錯，且方向保守。";

fn main() {
    let mut diffs = Diffs::default();
    let mut stats = (0u64, 0u64);

    println!("== config 1：stellar_steady_hand_charges = 0（ffxiv-crafter 線上實際設定）");
    run_config(0x12345678_9abcdef0, 40_000, 0, &mut diffs, &mut stats);
    println!("== config 2：stellar_steady_hand_charges = 3（涵蓋 群星穩定/倉促/冒進/高速製作）");
    run_config(0x0fedcba9_87654321, 40_000, 3, &mut diffs, &mut stats);

    println!("\n比對過的技能施放次數：{}，發生狀態分歧的走訪：{}\n", stats.0, stats.1);

    let mut unexpected = Vec::new();
    for (action, kinds) in &diffs.rows {
        for (kind, (n, ex)) in kinds {
            let known = ALLOWED.iter().find(|(a, k, _)| a == action && k == kind);
            match known {
                Some((_, _, why)) => println!("· 已知 [{action}][{kind}] ×{n}\n    {why}"),
                None => {
                    unexpected.push(format!("[{action}][{kind}] ×{n}  例：{ex}"));
                }
            }
        }
    }

    // 清單裡有、但這輪沒出現 → 多半是上游修好了，同樣要讓人看到（該移除我方 workaround / 更新清單）
    for (a, k, _) in ALLOWED {
        let seen = diffs.rows.get(*a).is_some_and(|m| m.contains_key(*k));
        if !seen {
            println!("· ⚠ 已知差異 [{a}][{k}] 這輪**沒有出現** — 上游可能修好了，請複核允許清單與對應 workaround");
        }
    }

    if unexpected.is_empty() {
        println!("\n✅ 沒有清單外的新分歧");
    } else {
        println!("\n❌ 出現 {} 項清單外的新分歧：", unexpected.len());
        for u in &unexpected {
            println!("   {u}");
        }
        println!("\n先查遊戲客戶端判誰對，再決定是修我方綁定還是補進 ALLOWED（附理由）。");
        std::process::exit(1);
    }
}
