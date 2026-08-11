@echo off
call "C:\Alex\Programme\Visual Studio\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64 >nul
cd /d C:\mixxx-build\launcher
rc /nologo /fo launcher.res launcher.rc
cl /nologo /O2 /EHsc /W3 launcher.cpp launcher.res /Fe:"Custom Mixxx.exe" /link /SUBSYSTEM:WINDOWS user32.lib shell32.lib
