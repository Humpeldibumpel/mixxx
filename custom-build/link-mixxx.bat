@echo off
SETLOCAL
call "C:\Alex\Programme\Visual Studio\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
if errorlevel 1 exit /b 1
cd /d C:\mixxx-build\mixxx\build
if errorlevel 1 exit /b 2
cmake --build . --config RelWithDebInfo --target mixxx
exit /b %errorlevel%
