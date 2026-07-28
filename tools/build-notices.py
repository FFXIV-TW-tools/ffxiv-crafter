#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build-notices.py — 產出 THIRD-PARTY-NOTICES.md（散布 pkg/*.wasm 的授權義務）。

為什麼需要：`pkg/crafter_wasm_bg.wasm` 是把 raphael-rs（Apache-2.0）與一票 crate
**編譯進去**的二進位，CF Pages 的訪客＝收受者。Apache-2.0 §4(a) 要求交付 License 副本、
MIT 要求隨副本附上著作權宣告與授權文字 —— 頁尾只寫「Apache-2.0」不算給副本。

來源＝`wasm/Cargo.lock` 的實際依賴（不憑印象列），授權文字自本機 cargo registry 取。
用 py -3.11 跑；改依賴後重跑並一起 commit。
"""
import glob, os, re, sys

for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError): pass  # best-effort 編碼設定（窄 except，鐵則豁免 a）

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
REG = glob.glob(os.path.expanduser("~/.cargo/registry/src/*"))
GIT = glob.glob(os.path.expanduser("~/.cargo/git/checkouts/raphael-rs-*/*"))
SELF = "crafter-wasm"          # 本 repo 自己的 crate，不列第三方


def crate_dir(name, version):
    for s in REG:
        p = os.path.join(s, "%s-%s" % (name, version))
        if os.path.isdir(p):
            return p
    if name.startswith("raphael-") and GIT:
        return GIT[0]
    return None


def copyrights(d):
    """自 crate 的 LICENSE* 抓 Copyright 行（MIT 要求隨散布附上原著作權宣告）。"""
    out = []
    for fn in sorted(glob.glob(os.path.join(d or "", "LICENSE*"))):
        try:
            txt = open(fn, encoding="utf-8", errors="replace").read()
        except OSError as e:
            print("⚠ 讀不到 " + fn + ": %s" % e, file=sys.stderr); continue
        # 只認「Copyright (c) 2019 某人」這種真的宣告行；Apache 全文裡的 "copyright notice that is…"
        # 與模板 "Copyright [yyyy] [name of copyright owner]" 都會被年份條件濾掉
        for line in txt.splitlines():
            if re.match(r"\s*Copyright\s+(\((c|C)\)\s*|©\s*)?\d{4}", line):
                s = line.strip()
                if s not in out:
                    out.append(s)
    return out


def main():
    lock = open(os.path.join(ROOT, "wasm", "Cargo.lock"), encoding="utf-8").read()
    pkgs = re.findall(r'\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"', lock)
    rows, unknown = [], []
    for name, version in pkgs:
        if name == SELF:
            continue
        d = crate_dir(name, version)
        lic = "?"
        if d and os.path.exists(os.path.join(d, "Cargo.toml")):
            m = re.search(r'^license\s*=\s*"([^"]+)"',
                          open(os.path.join(d, "Cargo.toml"), encoding="utf-8", errors="replace").read(), re.M)
            if m:
                lic = m.group(1)
        if lic == "?" and name.startswith("raphael-"):
            lic = "Apache-2.0"          # raphael-rs 工作區根 LICENSE（子 crate 未在 Cargo.toml 重申）
        if lic == "?":
            unknown.append(name)
        rows.append((name, version, lic, copyrights(d)))

    lines = [
        "# 第三方授權聲明（THIRD-PARTY NOTICES）",
        "",
        "本站散布的 `pkg/crafter_wasm_bg.wasm` 由下列開源套件編譯而成。",
        "各套件授權全文：Apache-2.0 見 [`LICENSE-APACHE-2.0.txt`](LICENSE-APACHE-2.0.txt)、MIT 見 [`LICENSE-MIT.txt`](LICENSE-MIT.txt)；",
        "雙授權（`MIT OR Apache-2.0`）者本專案擇一即可，兩份全文均已附上。",
        "本工具自製碼採 MIT（見 [`LICENSE`](LICENSE)）。FFXIV 遊戲資料／圖示版權屬 SQUARE ENIX。",
        "",
        "> 本檔由 `tools/build-notices.py` 自 `wasm/Cargo.lock` 產生（含建置期 proc-macro 套件，寧可多列不可漏列）。改依賴後重跑。",
        "",
        "| 套件 | 版本 | 授權 | 著作權 |",
        "|------|------|------|--------|",
    ]
    for name, version, lic, cps in rows:
        lines.append("| `%s` | %s | %s | %s |" % (name, version, lic, "<br>".join(cps) or "—"))
    lines.append("")
    lines.append("求解引擎 [raphael-rs](https://github.com/KonaeAkira/raphael-rs) v0.26.2（`raphael-solver` / `raphael-sim`，作者 KonaeAkira）"
                 "以**未修改**的原始碼編譯連結；本專案僅另寫 WASM 薄綁定（`wasm/src/lib.rs`）與全部 UI。")
    lines.append("")
    out = os.path.join(ROOT, "THIRD-PARTY-NOTICES.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("✓ THIRD-PARTY-NOTICES.md：%d 個套件%s" % (
        len(rows), ("（授權未知：%s）" % unknown) if unknown else ""))


if __name__ == "__main__":
    main()
