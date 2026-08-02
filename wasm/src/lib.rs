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

// 「工匠的神速技巧」在遊戲裡**不消耗耐久**，raphael v0.26.2 卻把它寫死成 10：
//   raphael-sim/src/actions.rs  impl ActionImpl for TrainedEye { fn base_durability_cost(..) -> u16 { 10 } }
// 判準是日文客戶端文案（en_CraftAction 只標非預設值故無法判別，ja 則是**每個**會消耗耐久的技能
// 都寫「耐久を消費して」——連預設 10 的「加工」也寫，而「匠の早業」整段沒有任何耐久字眼；
// 對照組「匠の神業」(Trained Finesse, 0) 寫的是「耐久を消費せず」）。Teamcraft 的
// trained-eye.ts `getDurabilityCost() { return 0 }` 與 Tnze ffxiv-crafting 亦為 0。
// 上游 main 分支至今仍是 10，升版救不了。
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

// 兩個候選手法誰比較好：先要做得完、再要品質高、再要步數少、最後看剩餘 CP。
// （步數少＝巨集段數少；15 行是遊戲上限，14 步與 17 步的差別就是貼一段還是兩段。）
fn better(a: &Output, b: &Output) -> bool {
    (a.complete, a.final_quality, std::cmp::Reverse(a.step_count), a.final_cp)
        > (b.complete, b.final_quality, std::cmp::Reverse(b.step_count), b.final_cp)
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
    let target_total = u32::from(inp.target_quality);

    // 神速技巧開局。**不能直接讓 raphael 自己選它**——它會多扣 10 點耐久（見上方常數註解），
    // 預算變少 → 手法無謂變長（實測 1260 組配置有 365 組偏長，最壞 17 步 vs 14 步＝多貼一段巨集）。
    // 拆解的正當性：神速技巧只能在第 1 步用，且直接把品質補到目標，所以
    //   「神速技巧開局的最佳解」＝ 神速技巧 ＋「耐久滿、CP−250、只需衝進展」的最佳解，
    // 而那個子問題用**真實耐久**求解即可，繞開上游的錯又不必改它一行原始碼。
    // 子問題必須拿掉同為「僅第 1 步可用」的堅信／閒靜，否則子求解器會以為自己在第 1 步而誤用。
    // NQ 模式（target_quality == initial_quality）用神速技巧只是白花 250 CP，直接跳過。
    let plan_b = if inp.use_trained_eye
        && settings.max_cp >= TRAINED_EYE_CP
        && settings.max_quality > 0
    {
        let mut b_settings = settings;
        b_settings.max_cp = settings.max_cp - TRAINED_EYE_CP;
        b_settings.max_quality = 0; // 神速技巧已把品質補到目標，子問題只剩進展
        b_settings.adversarial = false; // 品質已定，球色風險不再適用
        b_settings.backload_progress = false; // 沒有品質可以後置
        b_settings.allowed_actions = settings
            .allowed_actions
            .remove(Action::TrainedEye)
            .remove(Action::MuscleMemory)
            .remove(Action::Reflect);
        run_solver(&b_settings).ok().map(|sub| {
            let mut acts = Vec::with_capacity(sub.len() + 1);
            acts.push(Action::TrainedEye);
            acts.extend(sub);
            replay(&settings, &acts, inp.initial_quality, inp.max_progress, inp.max_quality)
        })
    } else {
        None
    };

    // 神速技巧那條路做得完就直接採用：它必然把品質補到目標，不可能被別的手法在品質上超越。
    // 刻意**不**順便算一份「停用神速技巧」的對照解——那條路要求解器不准用神速技巧、還得靠加工把
    // 品質堆到滿，在神速技巧本來就適用的低階配方上純屬白花求解時間（實測慢 1–2 秒，不致命但無意義）。
    if let Some(ob) = plan_b {
        if ob.complete && ob.final_quality >= target_total {
            return Ok(ob);
        }
        // B 沒做完（CP 扣掉 250 後衝不完進展等）→ 退回原本的單次求解，兩者取優。
        let fallback = run_solver(&settings)
            .ok()
            .map(|acts| replay(&settings, &acts, inp.initial_quality, inp.max_progress, inp.max_quality));
        return Ok(match fallback {
            Some(oa) => if better(&ob, &oa) { ob } else { oa },
            None => ob,
        });
    }

    // 不適用神速技巧：維持原本的單次求解路徑。
    let actions = run_solver(&settings)?;
    Ok(replay(&settings, &actions, inp.initial_quality, inp.max_progress, inp.max_quality))
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

    // 神速技巧適用時，走查第一步就該是它，且品質直接補到目標（研究者手斧 rlv620 ＋ Lv100 標準數值）。
    #[test]
    fn trained_eye_path_is_taken_and_fills_quality() {
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
        let out = solve_input(&inp).expect("求解應成功");
        assert!(out.complete && out.final_quality == 12900);
        assert_eq!(out.steps[0].action, "TrainedEye", "應走神速技巧那條路");
        assert_eq!(out.steps[0].durability, 70, "神速技巧不耗耐久");
    }

    // 求解端：直接交給 raphael 選神速技巧會少 10 點耐久預算 → 手法無謂變長。
    // 本測試同時證明「拆解確實有作用」（嚴格更短）與「結果仍然正確」（做得完＋品質滿）。
    // ⚠ 若哪天上游修好了這條，naive 會等於 ours 而讓本測試轉紅 —— 那是**該移除本檔 workaround** 的信號，不是壞事。
    #[test]
    fn trained_eye_plan_is_not_padded_by_upstream_durability_bug() {
        let inp = tight_te_input();
        let ours = solve_input(&inp).expect("求解應成功");
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
