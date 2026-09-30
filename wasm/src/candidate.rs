// 候選手法的比較鍵與「單步即完成」快速路徑（solve_input 用，B-043）。
// 玩家拿到的是巨集：品質達到 Q＝min(目標品質, 配方上限) 後就不再加分，
// 接著比實際製作時間，再比步數（行數少＝巨集段數少）。剩餘 CP 不參與比較。
// 時間一律取 raphael 的 `Action::time_cost()`——replay 寫進 Step.time／total_time、JS 產巨集
// `<wait.N>` 的同一個來源，候選比較與玩家實際看到的秒數不會分岔。
use std::cmp::Reverse;

use raphael_simulator::{Action, Condition, Settings, SimulationState};

use crate::{replay, Input, Output, ALL_ACTIONS};

// 字典序比較，大者較好：做得完 → 封頂後品質 → 總時間短 → 步數少。
type Rank = (bool, u32, Reverse<u32>, Reverse<usize>);

fn rank_of(complete: bool, quality: u32, total_time: u32, step_count: usize, q: u32) -> Rank {
    (complete, quality.min(q), Reverse(total_time), Reverse(step_count))
}

fn rank(out: &Output, q: u32) -> Rank {
    rank_of(out.complete, out.final_quality, out.total_time, out.step_count, q)
}

/// 評分用的品質上限 Q；求解器吃的剩餘需求仍是 target − initial（見 build_settings）。
pub(crate) fn quality_cap(inp: &Input) -> u32 {
    u32::from(inp.target_quality.min(inp.max_quality))
}

/// challenger 嚴格優於 incumbent 才換；完全同分保留現候選，結果不隨 raw 品質／CP 飄動。
pub(crate) fn better(challenger: &Output, incumbent: &Output, q: u32) -> bool {
    rank(challenger, q) > rank(incumbent, q)
}

/// 窮舉單步：初始狀態下逐一套用每個技能（神速技巧除外，它走 B-017 補償子問題），
/// 條件與 replay 相同（Condition::Normal、raphael 公開模擬器）。某技能單步就做完且品質達 Q，
/// 就是 1 步 3 秒的絕對下界——任何含進展的手法至少 1 步、進展技能都是 3 秒——不必再跑求解器。
/// 多個技能都行時依同一比較鍵取優，同分取列舉順序在前者。
pub(crate) fn single_step_optimum(settings: &Settings, inp: &Input, q: u32) -> Option<Output> {
    let start = SimulationState::new(settings);
    let mut best: Option<(Rank, Action)> = None;
    for &action in &ALL_ACTIONS {
        if action == Action::TrainedEye {
            continue;
        }
        // Err＝此狀態下本來就不能用（等級、遮罩、CP、連擊前提、非 100% 成功率），不是候選。
        let Ok(state) = start.use_action(action, Condition::Normal, settings) else {
            continue;
        };
        let quality = u32::from(state.quality) + u32::from(inp.initial_quality);
        if state.progress < inp.max_progress || quality < q {
            continue;
        }
        let r = rank_of(true, quality, u32::from(action.time_cost()), 1, q);
        if best.map_or(true, |(best_rank, _)| r > best_rank) {
            best = Some((r, action));
        }
    }
    best.map(|(_, action)| {
        replay(settings, &[action], inp.initial_quality, inp.max_progress, inp.max_quality)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{build_settings, solve_input, trained_eye_candidate};

    // recipe 1008 楓木木材（rlv1：難度19／品質100／耐久60；係數 50／80／67），
    // Lv100 作業4000／加工4000／CP600（2026-09-30 健檢 B-043 實跑證據的同一組輸入）。
    fn recipe1008_input() -> Input {
        Input {
            max_cp: 600,
            max_durability: 40, // floor(60*67/100)
            max_progress: 9,    // floor(19*50/100)
            max_quality: 80,    // floor(100*80/100)
            base_progress: 802, // floor(4000*10/50 + 2)，Lv100 > cjl1 不套等級懲罰
            base_quality: 1368, // floor(4000*10/30 + 35)
            job_level: 100,
            use_manipulation: true,
            use_heart_and_soul: false,
            use_quick_innovation: false,
            use_trained_eye: true, // app-formula：Lv100 ≥ cjl1+10 自動開
            adversarial: false,
            backload_progress: false,
            stellar_steady_hand_charges: 0,
            target_quality: 80,
            initial_quality: 0,
            actions: vec![],
        }
    }

    // 舊版自動神速技巧回 TrainedEye→DelicateSynthesis（2步6秒），同輸入停用神速技巧則
    // DelicateSynthesis 1步3秒就做完且達 HQ——玩家拿到的巨集白白多一行、多 3 秒。
    // 球色（adversarial）與品質後置旗標都不應改變這個結論。
    #[test]
    fn recipe1008_single_step_beats_trained_eye_route() {
        for (adversarial, backload_progress) in [(false, false), (true, false), (false, true), (true, true)] {
            let inp = Input { adversarial, backload_progress, ..recipe1008_input() };
            let out = solve_input(&inp).expect("求解應成功");
            assert!(
                out.complete && out.final_quality >= 80,
                "應做完且品質達標（adversarial={adversarial} backload={backload_progress}）"
            );
            assert_eq!(
                (out.step_count, out.total_time),
                (1, 3),
                "應為 1 步 3 秒（adversarial={adversarial} backload={backload_progress}）"
            );
        }
    }

    // 評分與單步下界取配方真上限；即使輸入 target 超出上限，也不為不可再提升的品質多做一步。
    #[test]
    fn target_above_recipe_quality_uses_capped_single_step_requirement() {
        let inp = Input { target_quality: 2000, ..recipe1008_input() };
        let out = solve_input(&inp).expect("求解應成功");
        assert!(out.complete && out.final_quality >= 80 && out.final_quality < 2000);
        assert_eq!((out.step_count, out.total_time), (1, 3), "達配方上限即為單步最佳解");
    }

    // NQ、低目標，或素材初期品質已≥目標時，單步做完即為最佳，不該多走任何一步。
    #[test]
    fn met_quality_requirement_finishes_in_one_step() {
        for (target_quality, initial_quality) in [(0, 0), (40, 0), (80, 80), (40, 80)] {
            let inp = Input { target_quality, initial_quality, ..recipe1008_input() };
            let out = solve_input(&inp).expect("求解應成功");
            assert!(
                out.complete && out.final_quality >= u32::from(target_quality),
                "應做完且品質不低於目標（target={target_quality} initial={initial_quality}）"
            );
            assert_eq!(
                (out.step_count, out.total_time),
                (1, 3),
                "應為 1 步 3 秒（target={target_quality} initial={initial_quality}）"
            );
        }
    }

    // 溢出品質不加分：品質都已達 Q 時，較快的手法要勝出，不能因 raw 品質較高而換成較慢的。
    #[test]
    fn overflow_quality_does_not_beat_faster_capped_equal_candidate() {
        let inp = recipe1008_input();
        let settings = build_settings(&inp);
        let q = quality_cap(&inp);
        let slow = replay(&settings, &[Action::TrainedEye, Action::DelicateSynthesis], 0, inp.max_progress, inp.max_quality);
        let fast = replay(&settings, &[Action::DelicateSynthesis], 0, inp.max_progress, inp.max_quality);
        assert!(slow.complete && fast.complete, "前提：兩者都做得完");
        assert!(
            slow.final_quality > fast.final_quality && fast.final_quality >= q,
            "前提：慢的 raw 品質較高（{} vs {}），快的也已達 Q={q}",
            slow.final_quality,
            fast.final_quality
        );
        assert!(better(&fast, &slow, q), "封頂後同品質：較快者應勝出");
        assert!(!better(&slow, &fast, q), "較慢者不得以溢出品質取代較快者");
    }

    // 同總時間比步數（步數少＝巨集行數少）；完全同分則保留現候選，不拿 raw 品質或剩餘 CP 當決勝。
    #[test]
    fn equal_time_prefers_fewer_steps_and_full_tie_keeps_incumbent() {
        let inp = recipe1008_input();
        let settings = build_settings(&inp);
        let q = quality_cap(&inp);
        let run = |acts: &[Action]| replay(&settings, acts, 0, inp.max_progress, inp.max_quality);
        // 2+2+2+3 秒 vs 3+3+3 秒：同為 9 秒，4 步 vs 3 步
        let four = run(&[Action::Veneration, Action::Innovation, Action::GreatStrides, Action::DelicateSynthesis]);
        let three = run(&[Action::Observe, Action::Observe, Action::DelicateSynthesis]);
        let three_alt = run(&[Action::BasicTouch, Action::Observe, Action::DelicateSynthesis]);
        for out in [&four, &three, &three_alt] {
            assert!(out.complete && out.final_quality >= q, "前提：三者都做得完且達 Q");
        }
        assert_eq!(four.total_time, three.total_time, "前提：兩者總時間相同");
        assert!(better(&three, &four, q), "同時間應選步數少的");
        assert!(!better(&four, &three, q), "步數多的不得取代步數少的");
        assert_ne!(three.final_cp, three_alt.final_cp, "前提：兩個同分候選的剩餘 CP 不同");
        assert!(
            !better(&three_alt, &three, q) && !better(&three, &three_alt, q),
            "完全同分（時間、步數、封頂品質）應保留現候選"
        );
    }

    // 時間比步數優先：5 步 11 秒應勝過 4 步 12 秒，而不是固定挑最少步的手法。
    #[test]
    fn shorter_duration_beats_fewer_steps() {
        let inp = recipe1008_input();
        let settings = build_settings(&inp);
        let q = quality_cap(&inp);
        let fast = replay(&settings, &[
            Action::Veneration, Action::Innovation, Action::GreatStrides, Action::WasteNot,
            Action::DelicateSynthesis,
        ], 0, inp.max_progress, inp.max_quality);
        let short = replay(&settings, &[
            Action::Observe, Action::Observe, Action::Observe, Action::DelicateSynthesis,
        ], 0, inp.max_progress, inp.max_quality);
        assert!(fast.complete && short.complete && fast.final_quality >= q && short.final_quality >= q);
        assert!(
            fast.total_time < short.total_time && fast.step_count > short.step_count,
            "前提：較快者的步數較多"
        );
        assert!(better(&fast, &short, q), "品質都達標後應優先比較時間");
    }

    // 神速技巧扣 250 CP 後只剩 6：連 CarefulSynthesis（7 CP）都放不了，20 耐久最多
    // TrainedPerfection＋3×BasicSynthesis＝360 進展 < 700，這條路做不完；
    // 普通候選 MuscleMemory(300)→Veneration→CarefulSynthesis(450)＝750 做得完，應退回它。
    #[test]
    fn trained_eye_unaffordable_after_cp_falls_back_to_normal() {
        let inp = Input {
            max_cp: 256,
            max_durability: 20,
            max_progress: 700,
            max_quality: 1000,
            base_progress: 100,
            base_quality: 100,
            job_level: 100,
            use_manipulation: true,
            use_heart_and_soul: false,
            use_quick_innovation: false,
            use_trained_eye: true,
            adversarial: false,
            backload_progress: false,
            stellar_steady_hand_charges: 0,
            target_quality: 1000,
            initial_quality: 0,
            actions: vec![],
        };
        let settings = build_settings(&inp);
        assert!(
            trained_eye_candidate(&inp, &settings).map_or(true, |te| !te.complete),
            "前提：扣 250 CP 後神速技巧那條路做不完"
        );
        let out = solve_input(&inp).expect("應退回普通候選並求解成功");
        assert!(out.complete, "普通候選做得完");
        assert!(
            out.steps.iter().all(|s| s.action != "TrainedEye"),
            "不應留下做不完的神速技巧開局"
        );
    }
}
