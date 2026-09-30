// crafter-wasm — raphael-rs（Apache-2.0, KonaeAkira）求解/模擬薄綁定。
// 契約逆向自 raphael-cli/solve.rs（已對抗驗證）；公式在 JS 端算好後把 Settings 11 欄傳入。
use raphael_simulator::{Action, ActionMask, Condition, Settings, SimulationState};
use raphael_solvers::{AtomicFlag, MacroSolver, SolverSettings};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

mod candidate;

#[derive(Deserialize)]
struct Input {
    // 由 JS 依 FFXIV 公式（static-data + 角色數值）算好
    max_cp: u16,
    max_durability: u16,
    max_progress: u16,
    max_quality: u16, // 配方真實品質上限（顯示用）
    base_progress: u16,
    base_quality: u16,
    job_level: u8,
    // 能力旗標（JS 已含等級/is_expert 判定）
    use_manipulation: bool,
    use_heart_and_soul: bool,
    use_quick_innovation: bool,
    use_trained_eye: bool,
    adversarial: bool,
    backload_progress: bool,
    stellar_steady_hand_charges: u8,
    target_quality: u16,
    initial_quality: u16,
    #[serde(default)]
    actions: Vec<String>, // simulate 用：手動序列的 variant 名
}

#[derive(Serialize)]
struct Step {
    i: usize,       // 步索引：simulate 沙盒逐步定位用（app.js render 目前用自身 map index，未消費此欄）
    action: String, // raphael variant 名（JS 對 craft-actions.json 拿繁中名+icon）
    action_id: u32, // 遊戲 action id：simulate／未來 tooltip 用（app.js 目前以 action 名查對照表，未消費此欄）
    time: u8,
    progress: u32,
    quality: u32, // 已含 initial_quality（顯示用累計）
    durability: u16,
    cp: u16,
}

#[derive(Serialize)]
struct Output {
    steps: Vec<Step>,
    step_count: usize,
    total_time: u32,
    final_progress: u32,
    final_quality: u32,
    final_durability: u16, // 完成時耐久：simulate 檢視用（app.js render 目前不顯示，未消費此欄）
    final_cp: u16,         // 完成時 CP：同上，保留給 simulate
    max_progress: u32,
    max_quality: u32,
    complete: bool,
    error: Option<String>, // simulate：某步失敗（CP/耐久不足等）
    error_step: i32,       // 失敗的步索引，-1=無
}

// 全 35 個 Action 變體（單步窮舉與名稱 round-trip 共用）。
// 新增 raphael Action 變體時，action_name 的 exhaustive match 會先編譯報錯 → 提醒同步此陣列。
const ALL_ACTIONS: [Action; 35] = [
    Action::BasicSynthesis, Action::BasicTouch, Action::MasterMend, Action::Observe,
    Action::TricksOfTheTrade, Action::WasteNot, Action::Veneration, Action::StandardTouch,
    Action::GreatStrides, Action::Innovation, Action::WasteNot2, Action::ByregotsBlessing,
    Action::PreciseTouch, Action::MuscleMemory, Action::CarefulSynthesis, Action::Manipulation,
    Action::PrudentTouch, Action::AdvancedTouch, Action::Reflect, Action::PreparatoryTouch,
    Action::Groundwork, Action::DelicateSynthesis, Action::IntensiveSynthesis, Action::TrainedEye,
    Action::HeartAndSoul, Action::PrudentSynthesis, Action::TrainedFinesse, Action::RefinedTouch,
    Action::QuickInnovation, Action::ImmaculateMend, Action::TrainedPerfection, Action::StellarSteadyHand,
    Action::RapidSynthesis, Action::HastyTouch, Action::DaringTouch,
];

fn action_name(a: Action) -> &'static str {
    match a {
        Action::BasicSynthesis => "BasicSynthesis",
        Action::BasicTouch => "BasicTouch",
        Action::MasterMend => "MasterMend",
        Action::Observe => "Observe",
        Action::TricksOfTheTrade => "TricksOfTheTrade",
        Action::WasteNot => "WasteNot",
        Action::Veneration => "Veneration",
        Action::StandardTouch => "StandardTouch",
        Action::GreatStrides => "GreatStrides",
        Action::Innovation => "Innovation",
        Action::WasteNot2 => "WasteNot2",
        Action::ByregotsBlessing => "ByregotsBlessing",
        Action::PreciseTouch => "PreciseTouch",
        Action::MuscleMemory => "MuscleMemory",
        Action::CarefulSynthesis => "CarefulSynthesis",
        Action::Manipulation => "Manipulation",
        Action::PrudentTouch => "PrudentTouch",
        Action::AdvancedTouch => "AdvancedTouch",
        Action::Reflect => "Reflect",
        Action::PreparatoryTouch => "PreparatoryTouch",
        Action::Groundwork => "Groundwork",
        Action::DelicateSynthesis => "DelicateSynthesis",
        Action::IntensiveSynthesis => "IntensiveSynthesis",
        Action::TrainedEye => "TrainedEye",
        Action::HeartAndSoul => "HeartAndSoul",
        Action::PrudentSynthesis => "PrudentSynthesis",
        Action::TrainedFinesse => "TrainedFinesse",
        Action::RefinedTouch => "RefinedTouch",
        Action::QuickInnovation => "QuickInnovation",
        Action::ImmaculateMend => "ImmaculateMend",
        Action::TrainedPerfection => "TrainedPerfection",
        Action::StellarSteadyHand => "StellarSteadyHand",
        Action::RapidSynthesis => "RapidSynthesis",
        Action::HastyTouch => "HastyTouch",
        Action::DaringTouch => "DaringTouch",
    }
}

fn build_settings(inp: &Input) -> Settings {
    let mut mask = ActionMask::all();
    if !inp.use_heart_and_soul { mask = mask.remove(Action::HeartAndSoul); }
    if !inp.use_quick_innovation { mask = mask.remove(Action::QuickInnovation); }
    if !inp.use_manipulation { mask = mask.remove(Action::Manipulation); }
    if !inp.use_trained_eye { mask = mask.remove(Action::TrainedEye); }
    Settings {
        max_cp: inp.max_cp,
        max_durability: inp.max_durability,
        max_progress: inp.max_progress,
        max_quality: inp.target_quality.saturating_sub(inp.initial_quality), // 求解器吃「還需補多少」
        base_progress: inp.base_progress,
        base_quality: inp.base_quality,
        job_level: inp.job_level,
        allowed_actions: mask,
        adversarial: inp.adversarial,
        backload_progress: inp.backload_progress,
        stellar_steady_hand_charges: inp.stellar_steady_hand_charges,
    }
}

// 「工匠的神速技巧」在遊戲裡**不消耗耐久**，raphael（v0.26.2 起、v0.28.6 仍是）卻把它寫死成 10：
//   raphael-sim/src/actions.rs  impl ActionImpl for TrainedEye { fn base_durability_cost(..) -> u16 { 10 } }
// 判準是日文客戶端文案（en_CraftAction 只標非預設值故無法判別，ja 則是**每個**會消耗耐久的技能
// 都寫「耐久を消費して」——連預設 10 的「加工」也寫，而「匠の早業」整段沒有任何耐久字眼；
// 對照組「匠の神業」(Trained Finesse, 0) 寫的是「耐久を消費せず」）。Teamcraft 的
// trained-eye.ts `getDurabilityCost() { return 0 }` 與 Tnze ffxiv-crafting 亦為 0。
// 上游 main 分支至今仍是 10（2026-09-29 查），升版救不了。
//
// **我們不改 raphael 的原始碼**（頁尾與 THIRD-PARTY-NOTICES 聲明「以未修改原始碼編譯」，
// 一改就觸發 Apache-2.0 §4(b) 修改標示義務）——改用它的公開 API 在重放時把這 10 點補回來，
// 求解端則走 solve() 裡的子問題拆解（見該處註解）。兩處都只動本檔。
const TRAINED_EYE_PHANTOM_DURABILITY: u16 = 10;
const TRAINED_EYE_CP: u16 = 250;

// Condition::Normal 重放一串 action，逐步取 state（求解走查 + 手動沙盒共用）
fn replay(settings: &Settings, actions: &[Action], initial_quality: u16, max_progress: u16, max_quality: u16) -> Output {
    let mut state = SimulationState::new(settings);
    let mut steps = Vec::with_capacity(actions.len());
    let mut total_time = 0u32;
    let mut error = None;
    let mut error_step = -1i32;
    for (i, a) in actions.iter().enumerate() {
        match state.use_action(*a, Condition::Normal, settings) {
            Ok(ns) => state = ns,
            Err(e) => { error = Some(format!("{:?}", e)); error_step = i as i32; break; }
        }
        // 補回上游多扣的 10 點（見上方常數註解）。必須在這裡就修正，否則不只走查表的耐久
        // 顯示錯，後續步驟的「坯料製作耐久不足時效率減半」判定也會跟著錯。
        if *a == Action::TrainedEye {
            state.durability = state
                .durability
                .saturating_add(TRAINED_EYE_PHANTOM_DURABILITY)
                .min(settings.max_durability);
        }
        let t = a.time_cost();
        total_time += t as u32;
        steps.push(Step {
            i,
            action: action_name(*a).to_string(),
            action_id: a.action_id(),
            time: t,
            progress: u32::from(state.progress),
            quality: u32::from(state.quality) + u32::from(initial_quality),
            durability: state.durability,
            cp: state.cp,
        });
    }
    Output {
        step_count: steps.len(),
        total_time,
        final_progress: u32::from(state.progress),
        final_quality: u32::from(state.quality) + u32::from(initial_quality),
        final_durability: state.durability,
        final_cp: state.cp,
        max_progress: max_progress as u32,
        max_quality: max_quality as u32,
        complete: state.progress >= max_progress,
        steps,
        error,
        error_step,
    }
}

fn run_solver(s: &Settings) -> Result<Vec<Action>, String> {
    MacroSolver::new(
        SolverSettings { simulator_settings: *s, allow_non_max_quality_solutions: true },
        Box::new(|_| {}),
        Box::new(|_| {}),
        AtomicFlag::new(),
    )
    .solve()
    .map_err(|e| format!("{:?}", e))
}

// 神速技巧候選獨立保留：B-017 哨兵直接比較此子問題與上游 naive solve，
// 不依賴最終是否選到神速技巧。
fn trained_eye_candidate(inp: &Input, settings: &Settings) -> Option<Output> {
    // 神速技巧只能在第 1 步用，且直接把品質補到目標，所以最佳開局拆為：
    // 神速技巧＋「耐久滿、CP−250、只需衝進展」的子問題，繞開上游多扣 10 耐久。
    // 子問題移除同為僅第 1 步可用的堅信／閒靜，避免把子問題開局誤認為製作開局。
    if !inp.use_trained_eye || settings.max_cp < TRAINED_EYE_CP || settings.max_quality == 0 {
        return None;
    }
    let mut b_settings = *settings;
    b_settings.max_cp = settings.max_cp - TRAINED_EYE_CP;
    b_settings.max_quality = 0; // 神速技巧已補到目標，子問題只剩進展
    b_settings.adversarial = false;
    b_settings.backload_progress = false;
    b_settings.allowed_actions = settings
        .allowed_actions
        .remove(Action::TrainedEye)
        .remove(Action::MuscleMemory)
        .remove(Action::Reflect);
    run_solver(&b_settings).ok().map(|sub| {
        let mut acts = Vec::with_capacity(sub.len() + 1);
        acts.push(Action::TrainedEye);
        acts.extend(sub);
        replay(settings, &acts, inp.initial_quality, inp.max_progress, inp.max_quality)
    })
}

#[wasm_bindgen]
pub fn solve(input: JsValue) -> Result<JsValue, JsValue> {
    let inp: Input =
        serde_wasm_bindgen::from_value(input).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let out = solve_input(&inp).map_err(|e| JsValue::from_str(&e))?;
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsValue::from_str(&e.to_string()))
}

// 求解本體（與 wasm 邊界脫鉤，供 cargo test 直接呼叫）
fn solve_input(inp: &Input) -> Result<Output, String> {
    let settings = build_settings(inp);
    let q = candidate::quality_cap(inp);
    if let Some(out) = candidate::single_step_optimum(&settings, inp, q) {
        return Ok(out);
    }

    let plan_b = trained_eye_candidate(inp, &settings);
    // 神速技巧候選做完且品質達標就直接採用（B-053，Owner 2026-09-30 拍板）：
    // 唯一實測到更短的情況是「一步就做完」，上面的單步窮舉已涵蓋；再多跑一次普通候選
    // 在代表語料上慢 3–13 倍（rlv640 0.44→5.8 秒），產出手法全同，不值得。
    if let Some(te) = plan_b.as_ref() {
        if te.complete && te.final_quality >= q {
            return Ok(plan_b.unwrap());
        }
    }
    // 神速技巧不可行或未達標才求普通候選；只在此副本禁用神速技巧，simulate、replay 與 B-017 補償路徑仍允許它。
    let mut normal_settings = settings;
    normal_settings.allowed_actions = normal_settings.allowed_actions.remove(Action::TrainedEye);
    let normal = run_solver(&normal_settings).map(|actions| {
        replay(&settings, &actions, inp.initial_quality, inp.max_progress, inp.max_quality)
    });
    match (plan_b, normal) {
        (Some(te), Ok(normal)) => {
            Ok(if candidate::better(&normal, &te, q) { normal } else { te })
        }
        (Some(te), Err(_)) => Ok(te), // 普通候選無解時，保留已求得的神速技巧候選
        (None, normal) => normal,
    }
}

#[wasm_bindgen]
pub fn simulate(input: JsValue) -> Result<JsValue, JsValue> {
    let inp: Input =
        serde_wasm_bindgen::from_value(input).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let settings = build_settings(&inp);
    let actions = parse_actions(&inp.actions).map_err(|e| JsValue::from_str(&e))?;
    let out = replay(&settings, &actions, inp.initial_quality, inp.max_progress, inp.max_quality);
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsValue::from_str(&e.to_string()))
}

fn parse_actions(names: &[String]) -> Result<Vec<Action>, String> {
    names.iter().enumerate().map(|(i, name)| {
        parse_action(name).ok_or_else(|| format!("Unknown action at step {}: {}", i + 1, name))
    }).collect()
}

fn parse_action(s: &str) -> Option<Action> {
    Some(match s {
        "BasicSynthesis" => Action::BasicSynthesis,
        "BasicTouch" => Action::BasicTouch,
        "MasterMend" => Action::MasterMend,
        "Observe" => Action::Observe,
        "TricksOfTheTrade" => Action::TricksOfTheTrade,
        "WasteNot" => Action::WasteNot,
        "Veneration" => Action::Veneration,
        "StandardTouch" => Action::StandardTouch,
        "GreatStrides" => Action::GreatStrides,
        "Innovation" => Action::Innovation,
        "WasteNot2" => Action::WasteNot2,
        "ByregotsBlessing" => Action::ByregotsBlessing,
        "PreciseTouch" => Action::PreciseTouch,
        "MuscleMemory" => Action::MuscleMemory,
        "CarefulSynthesis" => Action::CarefulSynthesis,
        "Manipulation" => Action::Manipulation,
        "PrudentTouch" => Action::PrudentTouch,
        "AdvancedTouch" => Action::AdvancedTouch,
        "Reflect" => Action::Reflect,
        "PreparatoryTouch" => Action::PreparatoryTouch,
        "Groundwork" => Action::Groundwork,
        "DelicateSynthesis" => Action::DelicateSynthesis,
        "IntensiveSynthesis" => Action::IntensiveSynthesis,
        "TrainedEye" => Action::TrainedEye,
        "HeartAndSoul" => Action::HeartAndSoul,
        "PrudentSynthesis" => Action::PrudentSynthesis,
        "TrainedFinesse" => Action::TrainedFinesse,
        "RefinedTouch" => Action::RefinedTouch,
        "QuickInnovation" => Action::QuickInnovation,
        "ImmaculateMend" => Action::ImmaculateMend,
        "TrainedPerfection" => Action::TrainedPerfection,
        "StellarSteadyHand" => Action::StellarSteadyHand,
        "RapidSynthesis" => Action::RapidSynthesis,
        "HastyTouch" => Action::HastyTouch,
        "DaringTouch" => Action::DaringTouch,
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // parse_action ∘ action_name == identity：防兩份平行 35 列舉拼寫分歧（不會編譯報錯）。
    #[test]
    fn action_name_parse_round_trip() {
        for a in ALL_ACTIONS {
            let name = action_name(a);
            let parsed = parse_action(name)
                .unwrap_or_else(|| panic!("parse_action 不認得 action_name 產出的「{name}」"));
            assert_eq!(action_name(parsed), name, "「{name}」round-trip 對應到不同變體");
        }
    }

    // action_name 產出的名稱須唯一：否則 round-trip 假性通過、JS 端會拿錯 icon／繁中名。
    #[test]
    fn action_names_unique() {
        let names: Vec<&str> = ALL_ACTIONS.iter().map(|&a| action_name(a)).collect();
        for (i, n) in names.iter().enumerate() {
            assert!(!names[..i].contains(n), "action_name 重複產出「{n}」");
        }
    }

    #[test]
    fn simulation_rejects_unknown_action_instead_of_skipping_it() {
        let names = vec!["BasicTouch".into(), "NOT_AN_ACTION".into(), "BasicSynthesis".into()];
        assert!(parse_actions(&names).is_err());
    }

    // 實測用的緊繃配方：rlv640 系（cjl90・難度4488・耐久35）、Lv100 角色、作業 2280 / 加工 3600 / CP 450。
    // 這組是 2026-08-02 差分掃描裡差距最大的一組（上游 17 步 vs 正確 14 步）。
    fn tight_te_input() -> Input {
        Input {
            max_cp: 450,
            max_durability: 35,
            max_progress: 4488,
            max_quality: 12900,
            base_progress: 177, // floor(2280*10/130 + 2)，Lv100 > cjl90 故不套等級懲罰
            base_quality: 348,  // floor(3600*10/115 + 35)
            job_level: 100,
            use_manipulation: true,
            use_heart_and_soul: false,
            use_quick_innovation: false,
            use_trained_eye: true,
            adversarial: false,
            backload_progress: false,
            stellar_steady_hand_charges: 0,
            target_quality: 12900,
            initial_quality: 0,
            actions: vec![],
        }
    }

    // 上游 raphael 把「工匠的神速技巧」的耐久寫死 10、遊戲實際 0（判準見檔案上方常數註解）。
    // 走查表的耐久是玩家直接看到的數字，錯了會與遊戲對不上。
    #[test]
    fn trained_eye_consumes_no_durability() {
        let inp = tight_te_input();
        let settings = build_settings(&inp);
        let out = replay(&settings, &[Action::TrainedEye], 0, inp.max_progress, inp.max_quality);
        assert_eq!(out.steps.len(), 1);
        assert_eq!(
            out.steps[0].durability, inp.max_durability,
            "神速技巧不該消耗耐久（上游多扣 10，replay 需補回）"
        );
        assert_eq!(out.steps[0].cp, inp.max_cp - TRAINED_EYE_CP, "CP 消耗 250 不變");
        assert_eq!(out.steps[0].quality, u32::from(inp.target_quality), "品質應被拉滿");
    }

    // 研究者手斧 rlv620＋Lv100：無論選哪個候選，都要完成達標且成本不劣於神速技巧。
    #[test]
    fn selected_candidate_meets_quality_without_worsening_trained_eye_cost() {
        let inp = Input {
            max_cp: 689,
            max_durability: 70,
            max_progress: 5720,
            max_quality: 12900,
            base_progress: 385, // floor(4986*10/130 + 2)
            base_quality: 468,  // floor(4886*10/115 + 35)
            job_level: 100,
            use_manipulation: true,
            use_heart_and_soul: false,
            use_quick_innovation: false,
            use_trained_eye: true,
            adversarial: false,
            backload_progress: false,
            stellar_steady_hand_charges: 0,
            target_quality: 12900,
            initial_quality: 0,
            actions: vec![],
        };
        let te = trained_eye_candidate(&inp, &build_settings(&inp)).expect("神速技巧候選應可行");
        let out = solve_input(&inp).expect("求解應成功");
        let q = candidate::quality_cap(&inp);
        assert!(out.complete && out.final_quality.min(q) == q, "應完成且封頂品質達標");
        assert!(
            (out.total_time, out.step_count) <= (te.total_time, te.step_count),
            "時間優先、同時間比步數：結果不應劣於神速技巧候選"
        );
    }

    // 求解端：直接交給 raphael 選神速技巧會少 10 點耐久預算 → 手法無謂變長。
    // 本測試同時證明「拆解確實有作用」（嚴格更短）與「結果仍然正確」（做得完＋品質滿）。
    // ⚠ 若哪天上游修好了這條，naive 會等於 ours 而讓本測試轉紅 —— 那是**該移除本檔 workaround** 的信號，不是壞事。
    #[test]
    fn trained_eye_plan_is_not_padded_by_upstream_durability_bug() {
        let inp = tight_te_input();
        let ours = trained_eye_candidate(&inp, &build_settings(&inp)).expect("神速技巧子問題應可行");
        assert!(ours.complete, "應做得完");
        assert_eq!(ours.final_quality, u32::from(inp.target_quality), "神速技巧應把品質補滿");

        // 對照組：完全交給上游求解器自己決定（含它多扣 10 耐久的 TrainedEye）
        let naive_settings = build_settings(&inp);
        let naive_actions = run_solver(&naive_settings).expect("對照組求解應成功");
        let naive = replay(&naive_settings, &naive_actions, 0, inp.max_progress, inp.max_quality);
        assert!(
            naive.step_count > ours.step_count,
            "拆解後步數應嚴格更短（上游 {} 步 / 本檔 {} 步）",
            naive.step_count,
            ours.step_count
        );
    }
}
