// crafter-wasm — raphael-rs（Apache-2.0, KonaeAkira）求解/模擬薄綁定。
// 契約逆向自 raphael-cli/solve.rs（已對抗驗證）；公式在 JS 端算好後把 Settings 11 欄傳入。
use raphael_simulator::{Action, ActionMask, Condition, Settings, SimulationState};
use raphael_solvers::{AtomicFlag, MacroSolver, SolverSettings};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

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
        let t = a.time_cost();
        total_time += t as u32;
        steps.push(Step {
            i,
            action: action_name(*a).to_string(),
            action_id: a.action_id(),
            time: t,
            progress: state.progress,
            quality: state.quality + initial_quality as u32,
            durability: state.durability,
            cp: state.cp,
        });
    }
    Output {
        step_count: steps.len(),
        total_time,
        final_progress: state.progress,
        final_quality: state.quality + initial_quality as u32,
        final_durability: state.durability,
        final_cp: state.cp,
        max_progress: max_progress as u32,
        max_quality: max_quality as u32,
        complete: state.progress >= max_progress as u32,
        steps,
        error,
        error_step,
    }
}

#[wasm_bindgen]
pub fn solve(input: JsValue) -> Result<JsValue, JsValue> {
    let inp: Input =
        serde_wasm_bindgen::from_value(input).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let settings = build_settings(&inp);
    let solver_settings = SolverSettings {
        simulator_settings: settings,
        allow_non_max_quality_solutions: true,
    };
    let actions = MacroSolver::new(
        solver_settings,
        Box::new(|_| {}),
        Box::new(|_| {}),
        AtomicFlag::new(),
    )
    .solve()
    .map_err(|e| JsValue::from_str(&format!("{:?}", e)))?;
    let out = replay(&settings, &actions, inp.initial_quality, inp.max_progress, inp.max_quality);
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn simulate(input: JsValue) -> Result<JsValue, JsValue> {
    let inp: Input =
        serde_wasm_bindgen::from_value(input).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let settings = build_settings(&inp);
    let actions: Vec<Action> = inp.actions.iter().filter_map(|s| parse_action(s)).collect();
    let out = replay(&settings, &actions, inp.initial_quality, inp.max_progress, inp.max_quality);
    serde_wasm_bindgen::to_value(&out).map_err(|e| JsValue::from_str(&e.to_string()))
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

    // 全 35 個 Action 變體（對齊 action_name / parse_action 兩份 match）。
    // 新增 raphael Action 變體時，action_name 的 exhaustive match 會先編譯報錯 → 提醒同步此陣列。
    const ALL: [Action; 35] = [
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

    // parse_action ∘ action_name == identity：防兩份平行 35 列舉拼寫分歧（不會編譯報錯）。
    #[test]
    fn action_name_parse_round_trip() {
        for a in ALL {
            let name = action_name(a);
            let parsed = parse_action(name)
                .unwrap_or_else(|| panic!("parse_action 不認得 action_name 產出的「{name}」"));
            assert_eq!(action_name(parsed), name, "「{name}」round-trip 對應到不同變體");
        }
    }

    // action_name 產出的名稱須唯一：否則 round-trip 假性通過、JS 端會拿錯 icon／繁中名。
    #[test]
    fn action_names_unique() {
        let names: Vec<&str> = ALL.iter().map(|&a| action_name(a)).collect();
        for (i, n) in names.iter().enumerate() {
            assert!(!names[..i].contains(n), "action_name 重複產出「{n}」");
        }
    }
}
