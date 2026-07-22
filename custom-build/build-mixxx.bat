@echo off
REM Mixxx Build Script - VS 2026 + Mixxx-Buildenv
SETLOCAL

echo === Loading VS Developer Environment ===
call "C:\Alex\Programme\Visual Studio\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
if errorlevel 1 (
    echo VsDevCmd.bat failed
    exit /b 1
)

echo === Setting Mixxx Buildenv vars ===
set "MIXXX_VCPKG_ROOT=C:\mixxx-build\mixxx\buildenv\mixxx-deps-2.6-x64-windows-12239ed"
set "VCPKG_TARGET_TRIPLET=x64-windows"
set "CMAKE_GENERATOR=Ninja"

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
