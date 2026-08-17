@echo off
SETLOCAL
REM Same VS lookup as build-mixxx.bat; "-products *" is required so that
REM Build Tools installations are found too. Override via VSDEVCMD.
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not defined VSDEVCMD if exist "%VSWHERE%" (
    for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
        set "VSDEVCMD=%%i\Common7\Tools\VsDevCmd.bat"
    )
)
if not exist "%VSDEVCMD%" (
    echo VsDevCmd.bat not found - set VSDEVCMD to your VS installation.
    exit /b 1
)
call "%VSDEVCMD%" -arch=x64 -host_arch=x64
if errorlevel 1 exit /b 1
cd /d C:\mixxx-build\mixxx\build
if errorlevel 1 exit /b 2
cmake --build . --config RelWithDebInfo --target mixxx
exit /b %errorlevel%
