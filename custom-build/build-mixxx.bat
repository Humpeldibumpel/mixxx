@echo off
REM Mixxx Build Script - Visual Studio + Mixxx-Buildenv
SETLOCAL

echo === Locating Visual Studio ===
REM Override by setting VSDEVCMD in the environment before calling this script.
REM vswhere needs "-products *" - without it, Build Tools installations (which
REM have no VS IDE product) are silently skipped and nothing is returned.
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not defined VSDEVCMD if exist "%VSWHERE%" (
    for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
        set "VSDEVCMD=%%i\Common7\Tools\VsDevCmd.bat"
    )
)
if not defined VSDEVCMD (
    echo Could not locate Visual Studio.
    echo Install the "Desktop development with C++" workload, or set VSDEVCMD
    echo to the full path of your VsDevCmd.bat before running this script.
    exit /b 1
)
if not exist "%VSDEVCMD%" (
    echo VsDevCmd.bat not found at "%VSDEVCMD%"
    exit /b 1
)
echo Using "%VSDEVCMD%"

echo === Loading VS Developer Environment ===
call "%VSDEVCMD%" -arch=x64 -host_arch=x64
if errorlevel 1 (
    echo VsDevCmd.bat failed
    exit /b 1
)

echo === Setting Mixxx Buildenv vars ===
set "MIXXX_VCPKG_ROOT=C:\mixxx-build\mixxx\buildenv\mixxx-deps-2.6-x64-windows-12239ed"
set "VCPKG_TARGET_TRIPLET=x64-windows"
set "CMAKE_GENERATOR=Ninja"

REM First build on a fresh machine: fetch the prebuilt dependencies (~2 GB
REM download, ~8 GB unpacked). Also creates the build\ and install\ dirs.
REM NOTE: run the first build from an interactive console. windows_buildenv.bat
REM unpacks via a nested powershell.exe when 7-Zip is absent, and that nested
REM process does not start when this script runs detached (no console) - it
REM hangs at 0% forever. Installing 7-Zip avoids the powershell path entirely.
if not exist "%MIXXX_VCPKG_ROOT%" (
    echo === Buildenv missing - downloading, this takes a while ===
    call "C:\mixxx-build\mixxx\tools\windows_buildenv.bat" setup
    if errorlevel 1 (
        echo buildenv setup failed
        exit /b 1
    )
    if not exist "%MIXXX_VCPKG_ROOT%" (
        echo buildenv still missing at "%MIXXX_VCPKG_ROOT%"
        exit /b 1
    )
)
if not exist "C:\mixxx-build\mixxx\build" md "C:\mixxx-build\mixxx\build"

echo === Verifying tools ===
where cmake
where ninja
where cl

cd /d C:\mixxx-build\mixxx\build
if errorlevel 1 (
    echo Failed to cd into build dir
    exit /b 1
)

echo === Running CMake configure ===
cmake ^
    -DCMAKE_TOOLCHAIN_FILE=%MIXXX_VCPKG_ROOT%\scripts\buildsystems\vcpkg.cmake ^
    -DVCPKG_TARGET_TRIPLET=x64-windows ^
    -DCMAKE_BUILD_TYPE=RelWithDebInfo ^
    -DDEBUG_ASSERTIONS_FATAL=OFF ^
    -DBATTERY=ON ^
    -DBROADCAST=ON ^
    -DBULK=ON ^
    -DHID=ON ^
    -DHSS1394=OFF ^
    -DLILV=ON ^
    -DLOCALECOMPARE=ON ^
    -DMAD=ON ^
    -DMEDIAFOUNDATION=ON ^
    -DMODPLUG=ON ^
    -DOPUS=ON ^
    -DQML=ON ^
    -DQTKEYCHAIN=ON ^
    -DVINYLCONTROL=ON ^
    -DWAVPACK=ON ^
    -DCMAKE_INSTALL_PREFIX=C:\mixxx-build\mixxx\install ^
    ..
if errorlevel 1 (
    echo CMake configure failed
    exit /b 2
)

echo === Building Mixxx (this can take 5-30 min) ===
cmake --build . --config RelWithDebInfo
if errorlevel 1 (
    echo Build failed
    exit /b 3
)

echo === BUILD SUCCESS ===
ENDLOCAL
exit /b 0
