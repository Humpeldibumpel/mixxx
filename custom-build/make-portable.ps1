<#
.SYNOPSIS
    Baut ein schlankes, portables Mixxx-Paket aus dem Build-Ordner.

.DESCRIPTION
    Kopiert nur die zum AUSFUEHREN noetigen Teile (Programm + DLLs + Qt-Plugins
    + Ressourcen) in einen sauberen Zielordner und legt einen portablen Launcher
    mit relativen Pfaden an. Der ~3 GB Build-Muell (Objektdateien, Autogen, Quellcode)
    wird weggelassen.

.PARAMETER Dest
    Zielordner fuer das portable Paket. Default: C:\mixxx-portable

.PARAMETER IncludeConfig
    Wenn gesetzt, wird auch config-isolated (Einstellungen/Library) mitkopiert.

.EXAMPLE
    .\make-portable.ps1
    .\make-portable.ps1 -Dest D:\Mixxx-Stick -IncludeConfig
#>
param(
    [string]$Dest = "C:\mixxx-portable",
    [switch]$IncludeConfig,
    [switch]$IncludeStemTools
)

$ErrorActionPreference = "Stop"
$Src      = "C:\mixxx-build"
$BuildDir = Join-Path $Src "mixxx\build"
$ResDir   = Join-Path $Src "mixxx\res"

# --- Vorpruefungen ---------------------------------------------------------
if (-not (Test-Path (Join-Path $BuildDir "mixxx.exe"))) {
    throw "mixxx.exe nicht gefunden in $BuildDir - wurde Mixxx schon gebaut?"
}
if (-not (Test-Path $ResDir)) {
    throw "Ressourcenordner fehlt: $ResDir"
}

Write-Host "=== Portables Mixxx-Paket bauen ===" -ForegroundColor Cyan
Write-Host "Quelle : $Src"
Write-Host "Ziel   : $Dest"
Write-Host ""

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$AppDir = Join-Path $Dest "app"

# --- 1) Programm + DLLs + Qt-Plugins (build -> app) ------------------------
# Ausgeschlossen: reine Build-Artefakt-Ordner und Entwickler-Dateien.
$excludeDirs = @(
    "CMakeFiles","Testing","meta_types","packaging","src",
    "mixxx-lib_autogen","mixxx-qml-lib_autogen","mixxx-qml-libplugin_autogen",
    "mixxx-qml-mixxxcontrols_autogen","mixxx-qml-mixxxcontrolsplugin_autogen",
    "mixxx-test_autogen","mixxx_autogen"
)
$excludeFiles = @("*.lib","*.exp","*.pdb","*.obj","mixxx-test.exe")

Write-Host "[1/3] Kopiere Programm + DLLs + Qt-Plugins ..." -ForegroundColor Green
# robocopy: /E = inkl. Unterordner, /XD = Ordner ausschliessen, /XF = Dateien ausschliessen,
# /NFL /NDL /NJH /NP = ruhigere Ausgabe. Exit-Codes < 8 sind Erfolg.
robocopy $BuildDir $AppDir /E /XD $excludeDirs /XF $excludeFiles /NFL /NDL /NJH /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy (Programm) fehlgeschlagen, Code $LASTEXITCODE" }

# --- 2) Ressourcen (res -> res) -------------------------------------------
Write-Host "[2/3] Kopiere Ressourcen (Skins, Mappings, Uebersetzungen) ..." -ForegroundColor Green
robocopy $ResDir (Join-Path $Dest "res") /E /NFL /NDL /NJH /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy (res) fehlgeschlagen, Code $LASTEXITCODE" }

# --- 3) Optional: Config/Library ------------------------------------------
if ($IncludeConfig) {
    $cfg = Join-Path $Src "config-isolated"
    if (Test-Path $cfg) {
        Write-Host "[3/3] Kopiere config-isolated (Einstellungen/Library) ..." -ForegroundColor Green
        robocopy $cfg (Join-Path $Dest "config") /E /NFL /NDL /NJH /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy (config) fehlgeschlagen, Code $LASTEXITCODE" }
    } else {
        Write-Host "[3/3] Hinweis: config-isolated nicht gefunden - uebersprungen." -ForegroundColor Yellow
    }
} else {
    Write-Host "[3/3] Config uebersprungen (ohne -IncludeConfig). Mixxx legt am Ziel eine frische an." -ForegroundColor Yellow
}

# --- Optional: Stem-Tools (Demucs) portabel mitpacken ---------------------
if ($IncludeStemTools) {
    $stemSrc = Join-Path $Src "stem-tools"
    $stemDst = Join-Path $Dest "stem-tools"
    if (Test-Path (Join-Path $stemSrc "venv\Scripts\python.exe")) {
        Write-Host "[*] Packe Stem-Tools (venv + Python + Modell + ffmpeg) ..." -ForegroundColor Green
        # venv, gebuendelte Basis-Python und die Skripte (ohne Testausgaben/Logs)
        $stemExclDirs  = @("__pycache__","test-output","model-cache-backup","hf-cache","ffmpeg")
        $stemExclFiles = @("*.log","*.orig","install-*.txt","pip-*.log")
        robocopy $stemSrc $stemDst /E /XD $stemExclDirs /XF $stemExclFiles /NFL /NDL /NJH /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy (stem-tools) fehlgeschlagen, Code $LASTEXITCODE" }

        # ffmpeg mitliefern (song2stem.py findet es relativ unter stem-tools\ffmpeg)
        robocopy (Join-Path $Src "ffmpeg") (Join-Path $stemDst "ffmpeg") /E /NFL /NDL /NJH /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy (ffmpeg) fehlgeschlagen, Code $LASTEXITCODE" }

        # HTDemucs-Modell in eine HuggingFace-Cache-Struktur (HF_HOME zeigt darauf)
        $modelSrc = Join-Path $stemSrc "model-cache-backup\models--adefossez--HTDemucs"
        if (Test-Path $modelSrc) {
            robocopy $modelSrc (Join-Path $stemDst "hf-cache\hub\models--adefossez--HTDemucs") /E /NFL /NDL /NJH /NP | Out-Null
        }
        Write-Host "    Stem-Tools eingepackt (venv wird beim Start auf die gebuendelte Python umgebogen)." -ForegroundColor Green
    } else {
        Write-Host "[*] Hinweis: stem-tools\venv nicht gefunden - Stem-Tools uebersprungen." -ForegroundColor Yellow
    }
}

# --- Qt-Plugins vollstaendig aus vcpkg-Qt nachziehen ----------------------
# Der Build-Ordner enthaelt nur einen Teil der Qt-Plugins (platforms, styles,
# imageformats, sqldrivers, tls); den Rest findet das Quell-Mixxx zur Laufzeit
# im vcpkg-Qt. Am Ziel-PC gibt es diesen Pfad NICHT, daher fehlten z.B. die
# SVG-Icon-Grafiken (iconengines\qsvgicon.dll) -> leere Play/CUE/Loop-Buttons.
# Wir kopieren daher die zum Ausfuehren noetigen Plugin-Ordner app-lokal.
Write-Host "[*] Ziehe vollstaendige Qt-Plugins aus vcpkg-Qt nach ..." -ForegroundColor Green
$qtPlugins = Get-ChildItem (Join-Path $Src "mixxx\buildenv") -Recurse -Directory `
    -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "Qt6\\plugins$" } | Select-Object -First 1
if ($qtPlugins) {
    $neededPluginDirs = @("platforms","styles","imageformats","iconengines",
        "generic","networkinformation","sqldrivers","tls")
    foreach ($pd in $neededPluginDirs) {
        $srcPd = Join-Path $qtPlugins.FullName $pd
        if (Test-Path $srcPd) {
            robocopy $srcPd (Join-Path $AppDir $pd) /E /NFL /NDL /NJH /NP | Out-Null
            if ($LASTEXITCODE -ge 8) { throw "robocopy (Plugin $pd) fehlgeschlagen, Code $LASTEXITCODE" }
        }
    }
} else {
    Write-Host "   Hinweis: vcpkg-Qt-Plugins nicht gefunden - nur Build-Plugins im Paket." -ForegroundColor Yellow
}

# --- MSVC-Runtime app-lokal (kein vc_redist noetig auf Win10/11) -----------
# mixxx.exe importiert MSVCP140 + VCRUNTIME140(_1); die Qt-DLLs ziehen ggf.
# msvcp140_1/_2 + concrt140 nach. Der Universal CRT (api-ms-win-crt-*) ist bei
# Windows 10/11 Teil des Systems und wird NICHT mitgeliefert.
Write-Host "[*] Kopiere MSVC-Runtime-DLLs app-lokal (macht vc_redist ueberfluessig) ..." -ForegroundColor Green
$runtimeDlls = @(
    "vcruntime140.dll","vcruntime140_1.dll",
    "msvcp140.dll","msvcp140_1.dll","msvcp140_2.dll","concrt140.dll"
)
$sys32 = Join-Path $env:SystemRoot "System32"
foreach ($d in $runtimeDlls) {
    $srcDll = Join-Path $sys32 $d
    if (Test-Path $srcDll) {
        Copy-Item $srcDll -Destination $AppDir -Force
    } else {
        Write-Host "   Hinweis: $d nicht in System32 gefunden - uebersprungen." -ForegroundColor Yellow
    }
}

# --- Portabler Launcher (relative Pfade via %~dp0) -------------------------
$launcher = @'
@echo off
REM Portabler Custom-Mixxx-Launcher - laeuft aus JEDEM Ordner (relative Pfade).
REM WICHTIG: --resourcePath/--settingsPath mit FORWARD-Slashes uebergeben.
REM Sonst verschluckt das SVG-Templating mancher Skins (z.B. Scheme PaleMoon)
REM die Backslashes -> Skin-Grafiken (Play/CUE/Loop) bleiben leer.
setlocal
set "BASE=%~dp0"
set "BASEFWD=%BASE:\=/%"
set "MIXXX_CONFIG=%BASE%config"
if not exist "%MIXXX_CONFIG%" mkdir "%MIXXX_CONFIG%"

REM --- Stem-Tools (Demucs) portabel aktivieren, falls mitgepackt ---
if not exist "%BASE%stem-tools\venv\Scripts\python.exe" goto :nostem
set "MIXXX_STEM_TOOLS=%BASE%stem-tools"
set "HF_HOME=%BASE%stem-tools\hf-cache"
set "HF_HUB_OFFLINE=1"
REM venv auf die gebuendelte Python umbiegen (Pfad variiert je Rechner/Stick)
> "%BASE%stem-tools\venv\pyvenv.cfg" echo home = %BASE%stem-tools\python-base
>>"%BASE%stem-tools\venv\pyvenv.cfg" echo include-system-site-packages = false
>>"%BASE%stem-tools\venv\pyvenv.cfg" echo version = 3.12.10
>>"%BASE%stem-tools\venv\pyvenv.cfg" echo executable = %BASE%stem-tools\python-base\python.exe
:nostem

echo Starte Custom Mixxx (portable) ...
"%BASE%app\mixxx.exe" --settingsPath "%BASEFWD%config" --resourcePath "%BASEFWD%res" %*
endlocal
'@
$launcherPath = Join-Path $Dest "run-mixxx.bat"
Set-Content -Path $launcherPath -Value $launcher -Encoding ASCII

# --- LIESMICH ---------------------------------------------------------------
$readme = @'
PORTABLES CUSTOM-MIXXX-PAKET
============================

Starten:  Doppelklick auf  run-mixxx.bat

VORAUSSETZUNG am Ziel-PC:
  Windows 10 oder 11 (64-bit). Dann laeuft das Paket OHNE weitere Installation -
  die noetigen MSVC-Runtime-DLLs liegen bereits im Ordner app\ .

  Nur bei aelteren/abgespeckten Windows (Server Core, Win7/8), falls beim Start
  eine "api-ms-win-crt-*.dll fehlt"-Meldung kommt: einmalig
  Microsoft Visual C++ 2015-2022 Redistributable (x64) = vc_redist.x64.exe
  installieren.

Ordner:
  app\     Programm + DLLs + Qt-Plugins
  res\     Ressourcen (Skins, Controller-Mappings, Uebersetzungen)
  config\  Einstellungen/Library (wird beim ersten Start automatisch angelegt,
           falls nicht mitkopiert)

Das Paket laeuft aus jedem Pfad (USB-Stick, anderer Laufwerksbuchstabe) -
run-mixxx.bat benutzt relative Pfade.
'@
Set-Content -Path (Join-Path $Dest "LIESMICH.txt") -Value $readme -Encoding ASCII

# --- Groesse melden ---------------------------------------------------------
$size = (Get-ChildItem $Dest -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host ""
Write-Host "=== FERTIG ===" -ForegroundColor Cyan
Write-Host ("Paket  : {0}" -f $Dest)
Write-Host ("Groesse: {0:N1} GB" -f ($size / 1GB))
Write-Host ("Starten: {0}" -f $launcherPath)
Write-Host ""
Write-Host "MSVC-Runtime ist app-lokal enthalten - auf Windows 10/11 KEIN vc_redist noetig." -ForegroundColor Green
