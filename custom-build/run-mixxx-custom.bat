@echo off
REM Starts the freshly built Mixxx from the build tree against an ISOLATED
REM profile. Do not point this build at your normal Mixxx config: it upgrades
REM mixxxdb.sqlite to the 2.7 schema, after which stable Mixxx can no longer
REM read the library. See CUSTOM-BUILD.md.
SETLOCAL

set "ROOT=C:\mixxx-build"
set "EXE=%ROOT%\mixxx\build\mixxx.exe"
set "SETTINGSDIR=%ROOT%\config-isolated"

REM Both paths are passed with FORWARD slashes on purpose: Qt's QSS parser
REM reads \m, \b, \r etc. as escape sequences, which silently breaks the skin
REM stylesheet and makes the button icons disappear.
set "SETTINGSFWD=C:/mixxx-build/config-isolated"
set "RESFWD=C:/mixxx-build/mixxx/res"

if not exist "%EXE%" (
    echo mixxx.exe not found at "%EXE%"
    echo Build it first:  %ROOT%\build-mixxx.bat
    exit /b 1
)

if not exist "%SETTINGSDIR%" (
    echo Creating isolated profile directory "%SETTINGSDIR%"
    md "%SETTINGSDIR%"
    echo NOTE: this profile is empty - no library, no controller mapping.
    echo Copy config-isolated from your other dev PC to keep your test setup.
)

echo Starting custom Mixxx from the build tree ...
"%EXE%" --settingsPath "%SETTINGSFWD%" --resourcePath "%RESFWD%" %*
exit /b %errorlevel%
