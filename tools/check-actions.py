#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check-actions.py — 機械護欄（健檢 DATA-1）。

確保 data/craft-actions.json 的鍵集合與 wasm/src/lib.rs 的 Action 變體完全一致。
防「重編 wasm 新增/改名 Action 卻忘了重跑 tools/build-data.py」→ 求解器吐出 craft-actions.json
沒有的變體 → app.js actionName() 靜默回退英文 → 巨集該行貼進遊戲失效（難察覺，因不報錯）。

用 py -3.11 tools/check-actions.py 跑；exit 0 = 一致、exit 1 = drift。
"""
import json
import hashlib
import os
import re
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass  # best-effort 編碼設定（窄 except，符合鐵則豁免 a）

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
LIB_RS = os.path.join(ROOT, "wasm", "src", "lib.rs")
WASM_SRC = os.path.join(ROOT, "wasm", "src")
TOOL_PINS = os.path.join(HERE, "wasm-tool-pins.json")
CARGO_TOML = os.path.join(ROOT, "wasm", "Cargo.toml")
Cargo_LOCK = os.path.join(ROOT, "wasm", "Cargo.lock")
BUILD_SCRIPT = os.path.join(ROOT, "tools", "build-wasm.ps1")
PKG_WASM = os.path.join(ROOT, "pkg", "crafter_wasm_bg.wasm")
PKG_JS = os.path.join(ROOT, "pkg", "crafter_wasm.js")
BUILD_STAMP = os.path.join(ROOT, "wasm", "BUILD-STAMP.json")
ACTIONS_JSON = os.path.join(ROOT, "data", "craft-actions.json")


def lib_variants():
    """取 action_name() 的 match arms — 求解器實際能 emit 的權威 Action 變體集合。"""
    src = open(LIB_RS, encoding="utf-8").read()
    m = re.search(r"fn action_name.*?\{(.*?)\n\}", src, re.S)
    body = m.group(1) if m else src
    return set(re.findall(r"Action::(\w+)\s*=>", body))


# CraftAction sheet 的未使用佔位列（ClassJobLevel=1）Icon 一律是這張灰底紅斜線圖。
# 選到它 → 手法序列上看起來像「已刪除技能」，但不會報錯 → 需機械守（2026-07-27 實際踩到 7 個技能）。
PLACEHOLDER_ICON = "000786.png"


def normalized_sha256(path):
    """讀 bytes 後只將 CRLF 正規化為 LF；必須與 build-wasm.ps1 完全一致。"""
    with open(path, "rb") as f:
        normalized = f.read().replace(b"\r\n", b"\n")
    return hashlib.sha256(normalized).hexdigest()


def wasm_src_sha256():
    """與 build-wasm.ps1 共用契約：Ordinal 路徑排序，UTF-8 路徑＋NUL＋內容 hash＋LF。"""
    paths = [
        os.path.relpath(os.path.join(directory, filename), WASM_SRC).replace(os.sep, "/")
        for directory, _, filenames in os.walk(WASM_SRC)
        for filename in filenames if filename.endswith(".rs")
    ]
    # .NET StringComparer.Ordinal 依 UTF-16 code unit 排序，含非 BMP 檔名時也要一致。
    paths.sort(key=lambda path: path.encode("utf-16-be", errors="surrogatepass"))
    digest = hashlib.sha256()
    for relative in paths:
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(normalized_sha256(os.path.join(WASM_SRC, relative)).encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def load_tool_pins():
    """版本契約只讀一份釘選檔；遺失或格式錯誤不得放行舊產物。"""
    try:
        with open(TOOL_PINS, encoding="utf-8") as f:
            pins = json.load(f)
        if not isinstance(pins, dict) or not all(
                isinstance(pins.get(key), str) and pins[key] for key in ("wasm_pack", "wasm_opt")):
            raise ValueError("必須含 wasm_pack／wasm_opt 非空字串")
    except (OSError, UnicodeDecodeError, ValueError) as exc:
        print("✗ 無法讀取 tools/wasm-tool-pins.json：%s；請修正釘選檔並用 tools\\build-wasm.ps1 重建" % exc,
              file=sys.stderr)
        return None
    return pins


def check_build_stamp():
    """確認 pkg/ 的建置戳記仍對應目前 WASM 原始碼、manifest、依賴鎖檔與建置腳本。"""
    sync_error = "✗ pkg/ 與 WASM 建置輸入不同步，請跑 tools\\build-wasm.ps1"
    if not os.path.isfile(BUILD_STAMP):
        print(sync_error, file=sys.stderr)
        print("→ 缺少 wasm/BUILD-STAMP.json", file=sys.stderr)
        return False

    try:
        with open(BUILD_STAMP, encoding="utf-8") as f:
            stamp = json.load(f)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        print(sync_error, file=sys.stderr)
        print("→ 無法讀取 wasm/BUILD-STAMP.json：%s" % exc, file=sys.stderr)
        return False

    if not isinstance(stamp, dict):
        print(sync_error, file=sys.stderr)
        print("→ wasm/BUILD-STAMP.json 格式無效", file=sys.stderr)
        return False

    pins = load_tool_pins()
    if pins is None:
        return False
    # 產物也要對（健檢 R5 M16）：戳記要證明「這份 pkg 由這份 wasm/src 產出」，只雜湊來源抓不到「忘了一起 commit pkg/」。
    try:
        expected = {
            "wasm_src": wasm_src_sha256(),
            "tool_pins": normalized_sha256(TOOL_PINS),
            "cargo_toml": normalized_sha256(CARGO_TOML),
            "cargo_lock": normalized_sha256(Cargo_LOCK),
            "build_script": normalized_sha256(BUILD_SCRIPT),
            "pkg_wasm": normalized_sha256(PKG_WASM),
            "pkg_js": normalized_sha256(PKG_JS),
        }
    except OSError as exc:
        print(sync_error, file=sys.stderr)
        print("→ 無法讀取建置輸入或產物：%s" % exc, file=sys.stderr)
        return False
    labels = {"wasm_src": "wasm/src/**/*.rs", "tool_pins": "tools/wasm-tool-pins.json",
              "cargo_toml": "wasm/Cargo.toml", "cargo_lock": "Cargo.lock",
              "build_script": "tools/build-wasm.ps1", "pkg_wasm": "pkg/crafter_wasm_bg.wasm",
              "pkg_js": "pkg/crafter_wasm.js"}
    mismatches = []
    for field, expected_hash in expected.items():
        actual_hash = stamp.get(field)
        if actual_hash != expected_hash:
            mismatches.append((labels[field], actual_hash, expected_hash))

    if mismatches:
        print(sync_error, file=sys.stderr)
        for label, stamped_hash, current_hash in mismatches:
            print("→ %s 不同步（戳記：%s；現況：%s）" %
                  (label, stamped_hash or "缺少", current_hash), file=sys.stderr)
        return False

    # 「別跑裸 wasm-pack」的機械防護：不論產物誰產的、怎麼產的，出貨前掃一次 bytes（原本唯一的掃描住在 build-wasm.ps1，走別條路產的就沒人掃）
    with open(PKG_WASM, "rb") as f:
        blob = f.read()
    # 只認帳號路徑（Users\…）：build-wasm.ps1 的 remap 把 USERPROFILE 換成 `~`，之後 `~\.cargo\registry\…` 是合法殘留、不是外洩
    for needle in (b"Users\\", b"Users/"):
        if needle in blob:
            print("✗ pkg/crafter_wasm_bg.wasm 含建置者路徑片段 %r（裸 wasm-pack 產物？請走 tools\\build-wasm.ps1）" % needle, file=sys.stderr)
            return False
    print("✓ pkg/ 與 WASM 建置輸入同步：BUILD-STAMP.json 的 wasm/src/**/*.rs / 工具釘選 / Cargo.toml / Cargo.lock / build-wasm.ps1 / pkg 產物 hash 一致，且產物無建置者路徑")
    return check_toolchain_pin(stamp, pins)


TOOLCHAIN_FILE = os.path.join(ROOT, "wasm", "rust-toolchain")
PINNED_CHANNEL = re.compile(r"^nightly-\d{4}-\d{2}-\d{2}$")


def check_toolchain_pin(stamp, pins):
    """nightly 釘日期，wasm-pack／wasm-opt 版本與 pins 精確相等；戳記缺欄位即要求重建。"""
    try:
        src = open(TOOLCHAIN_FILE, encoding="utf-8").read()
    except OSError as exc:
        print("✗ 讀不到 wasm/rust-toolchain：%s" % exc, file=sys.stderr)
        return False
    m = re.search(r'channel\s*=\s*"([^"]+)"', src)
    channel = m.group(1) if m else ""
    if not PINNED_CHANNEL.match(channel):
        print("✗ wasm/rust-toolchain 的 channel 是 %r，必須釘日期（nightly-YYYY-MM-DD）" % channel, file=sys.stderr)
        return False
    tc = stamp.get("toolchain")
    if not isinstance(tc, dict) or not all(
            isinstance(tc.get(k), str) and tc[k]
            for k in ("channel", "rustc", "rustc_commit", "wasm_pack", "wasm_opt")):
        print("✗ BUILD-STAMP.json 缺 toolchain 欄（channel／rustc／rustc_commit／wasm_pack／wasm_opt）——請用 tools\\build-wasm.ps1 重建", file=sys.stderr)
        return False
    if tc["channel"] != channel:
        print("✗ pkg/ 是用 %s 編的，而 rust-toolchain 現在釘 %s——改了 channel 就要重建 pkg/" % (tc["channel"], channel), file=sys.stderr)
        return False
    for key in ("wasm_pack", "wasm_opt"):
        if tc[key] != pins[key]:
            print("✗ pkg/ 的 %s 版本 %s 不符 tools/wasm-tool-pins.json 釘選 %s——請用 tools\\build-wasm.ps1 重建" %
                  (key, tc[key], pins[key]), file=sys.stderr)
            return False
    print("✓ 工具鏈已釘：%s（rustc %s @%s，wasm-pack %s，wasm-opt %s）" %
          (channel, tc["rustc"], tc["rustc_commit"][:9], tc["wasm_pack"], tc["wasm_opt"]))
    return True


def check_simdiff_pin():
    """tools/sim-diff 必須釘住與 wasm/ 相同的 raphael tag。

    差分測試的價值全在「測的是線上實際跑的那顆引擎」——兩邊版本一旦漂開，
    那張網就是假保護（綠燈但測的是別的東西），而且不會有任何錯誤訊號。
    """
    # 兩份 Cargo.toml 的依賴**別名不同**（wasm 用 raphael-simulator / sim-diff 用 raphael-sim），
    # 故不依賴別名：抓所有提到 raphael 的依賴行上的 tag，同檔內須一致。
    pat = re.compile(r'^\s*[\w-]+\s*=\s*\{[^}]*raphael[^}]*tag\s*=\s*"([^"]+)"', re.M)
    pairs = []
    for label, path in (("wasm", os.path.join(ROOT, "wasm", "Cargo.toml")),
                        ("tools/sim-diff", os.path.join(ROOT, "tools", "sim-diff", "Cargo.toml"))):
        try:
            src = open(path, encoding="utf-8").read()
        except OSError as exc:
            print("→ 讀不到 %s：%s" % (path, exc), file=sys.stderr)
            return False
        tags = set(pat.findall(src))
        if not tags:
            print("✗ %s/Cargo.toml 找不到 raphael 依賴的 tag" % label, file=sys.stderr)
            return False
        if len(tags) > 1:
            print("✗ %s/Cargo.toml 內部 raphael tag 就不一致：%s" % (label, sorted(tags)), file=sys.stderr)
            return False
        pairs.append((label, tags.pop()))
    if pairs[0][1] != pairs[1][1]:
        print("✗ raphael 版本漂移：%s=%s / %s=%s" % (pairs[0][0], pairs[0][1], pairs[1][0], pairs[1][1]),
              file=sys.stderr)
        print("→ 差分測試必須跟線上同版，否則是假保護；請同步兩份 Cargo.toml", file=sys.stderr)
        return False
    print("✓ sim-diff 與 wasm 釘同一個 raphael tag（%s）" % pairs[0][1])
    return True


def check_icons(data):
    """icon 健全性：不得為空、不得是 game_ref 的「無圖示」佔位圖。"""
    bad_null = sorted(k for k, v in data.items() if not (v or {}).get("icon"))
    bad_ph = sorted(k for k, v in data.items() if PLACEHOLDER_ICON in ((v or {}).get("icon") or ""))
    ok = True
    if bad_null:
        print("✗ %d 個變體無 icon（UI 會缺圖）：%s" % (len(bad_null), bad_null), file=sys.stderr)
        ok = False
    if bad_ph:
        print("✗ %d 個變體取到佔位圖 %s（看起來像已刪除技能）：%s"
              % (len(bad_ph), PLACEHOLDER_ICON, bad_ph), file=sys.stderr)
        print("→ build-data.py 的 lookup() 應排除佔位 icon 並取 class_job_level 最大的列", file=sys.stderr)
        ok = False
    return ok


def main():
    lib = lib_variants()
    if not lib:
        print("✗ 無法從 lib.rs 解析 Action 變體（action_name 格式可能已改）", file=sys.stderr)
        return 1
    data = json.load(open(ACTIONS_JSON, encoding="utf-8"))
    keys = set(data.keys())
    icons_ok = check_icons(data)
    missing = lib - keys   # solver 能吐但 craft-actions 沒有 → 巨集該行會失效
    extra = keys - lib     # craft-actions 多的（無害，但代表 drift）
    actions_ok = not missing and not extra and icons_ok
    if actions_ok:
        print("✓ action-set 一致：%d 個 Action 變體 == craft-actions.json 鍵（icon 全數有效）" % len(lib))
    sync_ok = check_build_stamp()
    pin_ok = check_simdiff_pin()
    if actions_ok and sync_ok and pin_ok:
        return 0
    if not actions_ok:
        if missing:
            print("✗ craft-actions.json 缺 %d 個 solver 能吐的變體（巨集會失效）：%s"
                  % (len(missing), sorted(missing)), file=sys.stderr)
        if extra:
            print("⚠ craft-actions.json 多 %d 個 lib.rs 無的鍵：%s"
                  % (len(extra), sorted(extra)), file=sys.stderr)
        print("→ 重跑 tools/build-data.py 使兩者對齊", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
