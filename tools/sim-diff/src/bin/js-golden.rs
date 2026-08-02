// 產出 ffxiv-crafting(Tnze) 的 golden 值，交給 Node 端與 ffxiv-crafter 的 JS 公式對帳。
//  1) base_synth / base_touch（＝我們 JS computeSettings 的 base_progress / base_quality）
//  2) 品質% → HQ% 對照表（＝我們 app-render.js 的 hqPercent）
use ffxiv_crafting as tz;

fn main() {
    let rlvs: [(i32, u8, u16, u32, u8, u8, u8, u8, u16); 8] = [
        (690, 100, 6600, 12000, 170, 150, 90, 75, 80),
        (685, 100, 6300, 11400, 167, 147, 90, 80, 80),
        (640, 90, 4400, 8600, 130, 115, 80, 70, 70),
        (620, 90, 4400, 8600, 130, 115, 80, 70, 70),
        (560, 90, 3500, 7200, 130, 115, 80, 70, 70),
        (480, 80, 2800, 8500, 110, 90, 80, 70, 70),
        (430, 80, 2600, 7400, 110, 90, 80, 70, 70),
        (290, 70, 1900, 6200, 90, 80, 100, 100, 70),
    ];

    println!("{{");
    println!("  \"base\": [");
    let mut first = true;
    for r in rlvs {
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
        let recipe = tz::Recipe::new(rlv, 100, 100, 100);
        let mut level = 55u8;
        while level <= 100 {
            let mut cms = 1200i32;
            while cms <= 5600 {
                let attrs = tz::Attributes {
                    level,
                    craftsmanship: cms,
                    control: cms + 37, // 隨便錯開，避免兩欄同值遮蔽錯誤
                    craft_points: 600,
                };
                let c = tz::Caches::new(&attrs, &recipe);
                if !first {
                    println!(",");
                }
                first = false;
                print!(
                    "    {{\"rlv\":{},\"cjl\":{},\"pdiv\":{},\"qdiv\":{},\"pmod\":{},\"qmod\":{},\"level\":{},\"cms\":{},\"ctrl\":{},\"bp\":{},\"bq\":{}}}",
                    r.0, r.1, r.4, r.5, r.6, r.7, level, cms, cms + 37,
                    c.base_synth as u32, c.base_touch as u32
                );
                cms += 173;
            }
            level += 3;
        }
    }
    println!("\n  ],");

    // HQ 表：Tnze 只在 quality*100/max 這個整數百分比上查表
    print!("  \"hq\": [");
    let rlv = tz::RecipeLevel {
        id: 690, class_job_level: 100, stars: 0, suggested_craftsmanship: 0,
        difficulty: 6600, quality: 12000, progress_divider: 170, quality_divider: 150,
        progress_modifier: 90, quality_modifier: 75, durability: 80, conditions_flag: 15,
    };
    let recipe = tz::Recipe::new(rlv, 100, 100, 100);
    let attrs = tz::Attributes { level: 100, craftsmanship: 5000, control: 5000, craft_points: 600 };
    for p in 0..=100u32 {
        let mut s = tz::Status::new(attrs, recipe);
        s.quality = recipe.quality * p / 100;
        let v = s.high_quality_probability().unwrap_or(-1);
        print!("{}{}", if p == 0 { "" } else { "," }, v);
    }
    println!("]");
    println!("}}");
}
