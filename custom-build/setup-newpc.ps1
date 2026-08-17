<#
.SYNOPSIS
    Sets up a new Windows machine to continue developing the Custom Mixxx build.

.DESCRIPTION
    Automates the parts that can be automated:
      1. Clone the fork + wire up the git remotes (fork / origin=upstream /
         ronso0 / alephlm), checked out on custom-build/downbeats-2.7.
      2. Create the stem-tools environment: a fresh venv + demucs + CPU torch +
         numpy (a fresh venv is far more reliable than copying one across PCs).
      3. Download ffmpeg (essentials) next to the stem scripts.
    Everything else that CAN'T be scripted is printed at the end (install Visual
    Studio, adjust the VS path in build-mixxx.bat, copy your personal
    config-isolated test folder).

    Install these FIRST (the script checks for them):
      - Git
      - Python 3.12 (x64)
      - Visual Studio 2022+ with the "Desktop development with C++" workload
        (this also provides CMake + Ninja)

.PARAMETER Root
    Project root. Default C:\mixxx-build — keep this to match the hard-coded
    paths in build-mixxx.bat etc.; use a different root only if you'll edit those.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File setup-newpc.ps1
#>
param([string]$Root = "C:\mixxx-build")

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # speeds up Invoke-WebRequest
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function AddRemote($name, $url) { if ((git remote) -notcontains $name) { git remote add $name $url } }

Write-Host "=== Custom Mixxx - Setup fuer neuen Rechner ===" -ForegroundColor Cyan
Write-Host "Zielordner: $Root`n"

# --- Prereq-Check ----------------------------------------------------------
$missing = @()
if (-not (Have git))    { $missing += "Git" }
if (-not (Have python)) { $missing += "Python 3.12 (x64)" }
if ($missing.Count) {
    Write-Host "FEHLT - bitte zuerst installieren: $($missing -join ', ')" -ForegroundColor Red
    return
}
if (-not (Have cmake)) {
    Write-Host "Hinweis: 'cmake' nicht im PATH - kommt normalerweise mit Visual Studio (C++)." -ForegroundColor Yellow
}
New-Item -ItemType Directory -Force $Root | Out-Null

# --- 1) Repo klonen + Remotes ---------------------------------------------
$repo = Join-Path $Root "mixxx"
if (Test-Path (Join-Path $repo ".git")) {
    Write-Host "[1/3] Repo existiert schon -> ueberspringe Clone." -ForegroundColor Green
    Push-Location $repo
} else {
    Write-Host "[1/3] Klone Fork ..." -ForegroundColor Green
    git clone https://github.com/Humpeldibumpel/mixxx.git $repo
    Push-Location $repo
    git remote rename origin fork   # clone names it 'origin'; match the dev PC
}
git checkout custom-build/downbeats-2.7
AddRemote fork    https://github.com/Humpeldibumpel/mixxx.git
AddRemote origin  https://github.com/mixxxdj/mixxx.git
AddRemote ronso0  https://github.com/ronso0/mixxx.git
AddRemote alephlm https://github.com/alephlm/mixxx.git
Write-Host "Remotes:" -ForegroundColor Green
git remote -v
Pop-Location

# --- 2) stem-tools: frisches venv + demucs/torch/numpy ---------------------
$stem   = Join-Path $Root "stem-tools"
$venvPy = Join-Path $stem "venv\Scripts\python.exe"
if (Test-Path $venvPy) {
    Write-Host "[2/3] stem-tools venv existiert schon -> ueberspringe." -ForegroundColor Green
} else {
    Write-Host "[2/3] Erstelle venv + installiere demucs/torch/numpy (grosser Download, dauert) ..." -ForegroundColor Green
    New-Item -ItemType Directory -Force $stem | Out-Null
    python -m venv (Join-Path $stem "venv")
    & $venvPy -m pip install --upgrade pip
    & $venvPy -m pip install torch --index-url https://download.pytorch.org/whl/cpu
    & $venvPy -m pip install demucs numpy
}
# Konverter-Skripte aus dem Repo daneben legen
foreach ($s in @("song2stem.py", "batch2stem.py")) {
    $src = Join-Path $repo "custom-build\$s"
    if (Test-Path $src) { Copy-Item $src $stem -Force }
}

# --- 3) ffmpeg (essentials) neben die Skripte ------------------------------
$ff = Join-Path $stem "ffmpeg"
if (Get-ChildItem $ff -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue) {
    Write-Host "[3/3] ffmpeg schon vorhanden -> ueberspringe." -ForegroundColor Green
} else {
    Write-Host "[3/3] Lade ffmpeg (essentials) ..." -ForegroundColor Green
    New-Item -ItemType Directory -Force $ff | Out-Null
    $zip = Join-Path $env:TEMP "ffmpeg-setup.zip"
    Invoke-WebRequest "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile $zip
    Expand-Archive $zip $ff -Force
    Remove-Item $zip
}

# --- Helfer-Skripte in den Root (gleiche Struktur wie Dev-PC) --------------
foreach ($s in @("build-mixxx.bat", "make-portable.ps1", "link-mixxx.bat")) {
    $src = Join-Path $repo "custom-build\$s"
    if (Test-Path $src) { Copy-Item $src $Root -Force }
}

# --- Manuelle Restschritte -------------------------------------------------
Write-Host "`n=== FERTIG (automatischer Teil) ===" -ForegroundColor Cyan
Write-Host "Noch von Hand:" -ForegroundColor Yellow
Write-Host "  1. Visual Studio 2022+ mit 'Desktop development with C++' installieren (bringt CMake + Ninja)." -ForegroundColor Yellow
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vs = & $vswhere -latest -property installationPath 2>$null
    if ($vs) {
        Write-Host "  2. In $Root\build-mixxx.bat den VsDevCmd-Pfad setzen auf:" -ForegroundColor Yellow
        Write-Host "       `"$vs\Common7\Tools\VsDevCmd.bat`"" -ForegroundColor Yellow
    }
} else {
    Write-Host "  2. In $Root\build-mixxx.bat den VsDevCmd-Pfad auf deine VS-Installation anpassen." -ForegroundColor Yellow
}
Write-Host "  3. Optional: 'config-isolated' vom alten PC nach $Root\config-isolated kopieren (Test-Library/Mapping)." -ForegroundColor Yellow
Write-Host "  4. Bauen:  $Root\build-mixxx.bat   (erster Build laedt die buildenv-Deps und dauert lange)." -ForegroundColor Yellow
Write-Host "  5. Das Demucs-Modell (~80 MB) laedt beim ersten Stem-Erzeugen automatisch (einmal Internet noetig)." -ForegroundColor Yellow
