# build-wasm.ps1 — 重建 pkg/（WASM 求解引擎產物）。需 nightly + wasm32-unknown-unknown + wasm-pack。
#
# 為什麼要包一層腳本而不是直接跑 wasm-pack：Rust 會把每個 panic 的原始碼路徑編進二進位，
# 而 crate 原始碼住在 %USERPROFILE%\.cargo\... → 產物裡會出現建置者的 Windows 帳號名，
# 而 pkg/*.wasm 是公開可下載的（瀏覽器必須抓它才能執行）。--remap-path-prefix 把家目錄改寫成 ~。
# 用 .cargo/config.toml 做不到這件事：rustflags 不做環境變數展開，寫死絕對路徑換一台機器就失效。
#
# 用法（powershell，於 repo 根或任意位置）：
#   powershell -ExecutionPolicy Bypass -File tools\build-wasm.ps1
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$wasmDir = Join-Path $repoRoot 'wasm'
$out = Join-Path $repoRoot 'pkg'
$stampPath = Join-Path $wasmDir 'BUILD-STAMP.json'
$pinsPath = Join-Path $repoRoot 'tools\wasm-tool-pins.json'

function Get-NormalizedSha256([string]$Path) {
  # 與 check-actions.py 對齊：只把 CRLF 正規化成 LF，其他 bytes 原樣保留。
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $normalized = New-Object 'System.Collections.Generic.List[byte]'
  for ($i = 0; $i -lt $bytes.Length; $i++) {
    if ($bytes[$i] -eq 13 -and $i + 1 -lt $bytes.Length -and $bytes[$i + 1] -eq 10) {
      [void]$normalized.Add(10)
      $i++
    } else {
      [void]$normalized.Add($bytes[$i])
    }
  }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return -join ($sha.ComputeHash([byte[]]$normalized.ToArray()) | ForEach-Object { $_.ToString('x2') })
  } finally {
    $sha.Dispose()
  }
}

function Get-WasmSrcSha256 {
  # 與 check-actions.py 對齊：src/ 相對路徑以 / 分隔、Ordinal 排序；
  # 每筆為 UTF-8「路徑 + NUL + CRLF 正規化內容的 SHA-256 + LF」，再雜湊整份清單。
  $srcDir = Join-Path $wasmDir 'src'
  [string[]]$paths = @(Get-ChildItem -LiteralPath $srcDir -Recurse -File -Force |
    Where-Object { $_.Extension -ceq '.rs' } |
    ForEach-Object { $_.FullName.Substring($srcDir.Length + 1).Replace('\', '/') })
  [Array]::Sort($paths, [StringComparer]::Ordinal)
  $manifest = New-Object System.Text.StringBuilder
  foreach ($relative in $paths) {
    [void]$manifest.Append($relative).Append([char]0).Append(
      (Get-NormalizedSha256 (Join-Path $srcDir $relative))).Append("`n")
  }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return -join ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($manifest.ToString())) |
      ForEach-Object { $_.ToString('x2') })
  } finally {
    $sha.Dispose()
  }
}

function Get-WasmOptVersion([string]$Path) {
  try {
    $output = (& $Path --version 2>&1 | Out-String).Trim()
    # Binaryen release 可附「(version_117)」等 revision；版號仍取 version 後的完整 token。
    if ($LASTEXITCODE -eq 0 -and $output -cmatch '^wasm-opt version (\S+)(?: \([^()\r\n]+\))?$') {
      return $Matches[1]
    }
    Write-Warning "無法確認 wasm-opt 版本：$Path（$output）"
  } catch {
    Write-Warning "無法執行 wasm-opt：$Path（$_）"
  }
  return $null
}

$originalRustFlags = [Environment]::GetEnvironmentVariable('RUSTFLAGS', 'Process')
$originalEncodedRustFlags = [Environment]::GetEnvironmentVariable('CARGO_ENCODED_RUSTFLAGS', 'Process')
$originalPath = [Environment]::GetEnvironmentVariable('PATH', 'Process')
$flagSeparator = [char]0x1f
$flags = @()
# 遵循 Cargo 優先序：encoded 已設定時優先使用；否則沿用 RUSTFLAGS 的 whitespace split 語意。
if ($null -ne $originalEncodedRustFlags) {
  if ($originalEncodedRustFlags.Length -gt 0) { $flags = @($originalEncodedRustFlags.Split($flagSeparator)) }
} elseif ($null -ne $originalRustFlags) {
  $flags = @($originalRustFlags -split '\s+' | Where-Object { $_ -ne '' })
}

# 家目錄 → ~；cargo home 若被搬到別處（CARGO_HOME）也一併改寫
$flags += "--remap-path-prefix=$env:USERPROFILE=~"
if ($env:CARGO_HOME) { $flags += "--remap-path-prefix=$env:CARGO_HOME=~/.cargo" }
# WebAssembly SIMD：raphael 的支配比較用 wide::u32x4（一次比 4 個值），不開這個旗標就退化成逐一比較。
# raphael 官網自己的建置也開著（上游 .cargo/config_wasm.toml 的 +simd128）。瀏覽器門檻：
# Chrome 91／Firefox 89／Safari 16.4（MDN BCD webassembly.fixed-width-SIMD），更舊的載入引擎即失敗。
$flags += '-C', 'target-feature=+simd128'

Push-Location $wasmDir
try {
  $pins = Get-Content -LiteralPath $pinsPath -Raw | ConvertFrom-Json
  foreach ($field in @('wasm_pack', 'wasm_opt')) {
    if ($pins.$field -isnot [string] -or -not $pins.$field) {
      throw "tools/wasm-tool-pins.json 缺少字串欄位 $field；請修正釘選檔後重建"
    }
  }
  # Application 排除 alias／function／.ps1；第一筆 PATH 命中對齊 wasm-pack 的 which＋PATHEXT。
  $wasmPack = Get-Command wasm-pack -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $wasmPack) { throw "找不到 wasm-pack；請執行 cargo install wasm-pack --version $($pins.wasm_pack) --locked" }
  $wasmPackOutput = (& $wasmPack.Path -V 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $wasmPackOutput -cnotmatch '^wasm-pack (\S+)$') {
    throw "wasm-pack -V 失敗或版本格式無效：$wasmPackOutput"
  }
  $wasmPackV = $Matches[1]
  if ($wasmPackV -cne $pins.wasm_pack) {
    throw "wasm-pack 版本 $wasmPackV 不符釘選 $($pins.wasm_pack)；請執行 cargo install wasm-pack --version $($pins.wasm_pack) --locked --force"
  }
  $optInstall = "請下載 https://github.com/WebAssembly/binaryen/releases/tag/version_$($pins.wasm_opt) 的 Windows release，解壓並把 bin 目錄放到 PATH"
  $wasmOpt = Get-Command wasm-opt -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  $wasmOptPath = $null
  if ($wasmOpt) {
    $wasmOptV = Get-WasmOptVersion $wasmOpt.Path
    if ($wasmOptV -cne $pins.wasm_opt) {
      throw "PATH 的 wasm-opt（$($wasmOpt.Path)）版本 $wasmOptV 不符釘選 $($pins.wasm_opt)；$optInstall"
    }
    $wasmOptPath = $wasmOpt.Path
  } else {
    $cacheRoot = if ($env:WASM_PACK_CACHE) { $env:WASM_PACK_CACHE } elseif ($env:LOCALAPPDATA) {
      Join-Path $env:LOCALAPPDATA '.wasm-pack'
    } else { $null }
    if ($cacheRoot -and (Test-Path -LiteralPath $cacheRoot -PathType Container)) {
      $candidates = Get-ChildItem -LiteralPath $cacheRoot -Directory -Filter 'wasm-opt-*' |
        ForEach-Object { Join-Path $_.FullName 'bin\wasm-opt.exe' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Sort-Object
      foreach ($candidate in $candidates) {
        $candidateV = Get-WasmOptVersion $candidate
        if ($candidateV -ceq $pins.wasm_opt) {
          $wasmOptPath = $candidate
          $wasmOptV = $candidateV
          break
        }
      }
    }
    if (-not $wasmOptPath) { throw "PATH 與 wasm-pack 快取皆無 wasm-opt $($pins.wasm_opt)；$optInstall" }
  }
  # 確保 optimizer 實際選到剛驗過的 binary；不覆寫上游 release 預設的 -O。
  $env:PATH = (Split-Path -Parent $wasmOptPath) + [IO.Path]::PathSeparator + $originalPath
  # 0x1f 分隔參數，保住含空白路徑的 remap；不要讓 Cargo 再按 whitespace 拆開。
  $env:CARGO_ENCODED_RUSTFLAGS = $flags -join $flagSeparator
  [Environment]::SetEnvironmentVariable('RUSTFLAGS', $null, 'Process')
  Write-Host "CARGO_ENCODED_RUSTFLAGS = $($flags -join ' | ')"
  # 工具鏈版本一起進戳記（B-038）：rust-toolchain 釘的是日期，這裡記的是**實際用來編這份 pkg 的**版本——
  # 兩者不一致（有人本機 override、或 rustup 沒裝那個日期而退回別的）由 check-actions.py 對帳。
  # 在 wasm/ 目錄下呼叫，rustup 才會讀到 rust-toolchain 的 channel。
  $rustcV = (& rustc -vV 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "rustc -vV 失敗（rust-toolchain 指定的 channel 未安裝？rustup toolchain install <channel> --target wasm32-unknown-unknown）" }
  $rustcRelease = ([regex]::Match($rustcV, 'release:\s*(\S+)')).Groups[1].Value
  $rustcCommit = ([regex]::Match($rustcV, 'commit-hash:\s*(\S+)')).Groups[1].Value
  # wasm-pack／wasm-opt 已在建置前驗證，下面只使用已解析的 wasm-pack executable。
  $channel = ([regex]::Match((Get-Content (Join-Path $wasmDir 'rust-toolchain') -Raw), 'channel\s*=\s*"([^"]+)"')).Groups[1].Value
  Write-Host "toolchain: channel=$channel rustc=$rustcRelease ($rustcCommit) wasm-pack=$wasmPackV wasm-opt=$wasmOptV"
  & $wasmPack.Path build --release --target web --out-dir $out
  if ($LASTEXITCODE -ne 0) { throw "wasm-pack 失敗（exit $LASTEXITCODE）" }
} finally {
  try { Pop-Location } finally {
    [Environment]::SetEnvironmentVariable('RUSTFLAGS', $originalRustFlags, 'Process')
    [Environment]::SetEnvironmentVariable('CARGO_ENCODED_RUSTFLAGS', $originalEncodedRustFlags, 'Process')
    [Environment]::SetEnvironmentVariable('PATH', $originalPath, 'Process')
  }
}

# 驗收：產物裡不得再出現建置者路徑（不變量，別只看「編過了」）
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $out 'crafter_wasm_bg.wasm'))
$text = [System.Text.Encoding]::ASCII.GetString($bytes)
$leaks = ([regex]::Matches($text, [regex]::Escape($env:USERPROFILE))).Count
if ($leaks -gt 0) { throw "✗ 產物仍含 $leaks 處建置者路徑（$env:USERPROFILE）— remap 未生效" }
Write-Host "✓ pkg/ 重建完成，無建置者路徑外洩（$($bytes.Length) bytes）"
# 驗收：SIMD 真的有進產物（rustc 會把啟用的 target feature 寫進 target_features 自訂段；CARGO_ENCODED_RUSTFLAGS 被外部覆寫時這裡會抓到）
if (-not $text.Contains('simd128')) { throw "✗ 產物沒有宣告 simd128 — CARGO_ENCODED_RUSTFLAGS 的 target-feature 未生效" }
Write-Host "✓ 產物已啟用 WebAssembly SIMD（simd128）"

$stamp = [ordered]@{
  wasm_src = Get-WasmSrcSha256
  tool_pins = Get-NormalizedSha256 $pinsPath
  cargo_toml = Get-NormalizedSha256 (Join-Path $wasmDir 'Cargo.toml')
  cargo_lock = Get-NormalizedSha256 (Join-Path $wasmDir 'Cargo.lock')
  build_script = Get-NormalizedSha256 (Join-Path $repoRoot 'tools\build-wasm.ps1')
  # 產物也要進戳記：只雜湊來源證明不了「這份 pkg 由這份 wasm/src 產出」——改了引擎、重建了、忘了一起 commit pkg/ 會全綠（健檢 R5 M16）
  pkg_wasm = Get-NormalizedSha256 (Join-Path $out 'crafter_wasm_bg.wasm')
  pkg_js = Get-NormalizedSha256 (Join-Path $out 'crafter_wasm.js')
  built_at = [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
  toolchain = [ordered]@{ channel = $channel; rustc = $rustcRelease; rustc_commit = $rustcCommit; wasm_pack = $wasmPackV; wasm_opt = $wasmOptV }
}
$stampJson = $stamp | ConvertTo-Json -Compress -Depth 3
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($stampPath, $stampJson + [Environment]::NewLine, $utf8NoBom)
Write-Host "✓ wasm/BUILD-STAMP.json 已更新（wasm/src/**/*.rs / 工具釘選 / Cargo.toml / Cargo.lock / build-wasm.ps1 / pkg 產物 hash）"
