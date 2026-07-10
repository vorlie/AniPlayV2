@echo off
setlocal
set "ANIPLAY_SAFE_GRAPHICS=1"

set "EXE=%~1"
if defined EXE if exist "%EXE%" goto launch

set "SCRIPT_DIR=%~dp0"

if exist "%SCRIPT_DIR%AniPlay.exe" set "EXE=%SCRIPT_DIR%AniPlay.exe" & goto launch
if exist "%SCRIPT_DIR%..\AniPlay.exe" set "EXE=%SCRIPT_DIR%..\AniPlay.exe" & goto launch
if exist "%SCRIPT_DIR%..\..\AniPlay.exe" set "EXE=%SCRIPT_DIR%..\..\AniPlay.exe" & goto launch
if exist "%LOCALAPPDATA%\Programs\AniPlay\AniPlay.exe" set "EXE=%LOCALAPPDATA%\Programs\AniPlay\AniPlay.exe" & goto launch
if exist "%ProgramFiles%\AniPlay\AniPlay.exe" set "EXE=%ProgramFiles%\AniPlay\AniPlay.exe" & goto launch
if exist "%ProgramFiles(x86)%\AniPlay\AniPlay.exe" set "EXE=%ProgramFiles(x86)%\AniPlay\AniPlay.exe" & goto launch

echo Could not find AniPlay.exe automatically.
echo Drag AniPlay.exe onto this script, or run:
echo launch-safe-graphics.cmd "C:\Path\To\AniPlay.exe"
pause
exit /b 1

:launch
echo Starting AniPlay in safe graphics mode: "%EXE%"
start "" "%EXE%" --safe-graphics
endlocal
