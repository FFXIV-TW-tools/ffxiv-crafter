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

# 家目錄 → ~；cargo home 若被搬到別處（CARGO_HOME）也一併改寫
$flags = @("--remap-path-prefix=$env:USERPROFILE=~")
if ($env:CARGO_HOME) { $flags += "--remap-path-prefix=$env:CARGO_HOME=~/.cargo" }
$env:RUSTFLAGS = $flags -join ' '
Write-Host "RUSTFLAGS = $env:RUSTFLAGS"

Push-Location $wasmDir
try {
  wasm-pack build --release --target web --out-dir $out
  if ($LASTEXITCODE -ne 0) { throw "wasm-pack 失敗（exit $LASTEXITCODE）" }
} finally { Pop-Location }

# 驗收：產物裡不得再出現建置者路徑（不變量，別只看「編過了」）
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $out 'crafter_wasm_bg.wasm'))
$text = [System.Text.Encoding]::ASCII.GetString($bytes)
$leaks = ([regex]::Matches($text, [regex]::Escape($env:USERPROFILE))).Count
if ($leaks -gt 0) { throw "✗ 產物仍含 $leaks 處建置者路徑（$env:USERPROFILE）— remap 未生效" }
Write-Host "✓ pkg/ 重建完成，無建置者路徑外洩（$($bytes.Length) bytes）"

$stamp = [ordered]@{
  lib_rs = Get-NormalizedSha256 (Join-Path $wasmDir 'src\lib.rs')
  cargo_lock = Get-NormalizedSha256 (Join-Path $wasmDir 'Cargo.lock')
  # 產物也要進戳記：只雜湊來源證明不了「這份 pkg 由這份 lib.rs 產出」——改了引擎、重建了、忘了一起 commit pkg/ 會全綠（健檢 R5 M16）
  pkg_wasm = Get-NormalizedSha256 (Join-Path $out 'crafter_wasm_bg.wasm')
  pkg_js = Get-NormalizedSha256 (Join-Path $out 'crafter_wasm.js')
  built_at = [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
}
$stampJson = $stamp | ConvertTo-Json -Compress
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($stampPath, $stampJson + [Environment]::NewLine, $utf8NoBom)
Write-Host "✓ wasm/BUILD-STAMP.json 已更新（lib.rs / Cargo.lock / pkg 產物 hash）"
