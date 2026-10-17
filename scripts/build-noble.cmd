@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=amd64
if errorlevel 1 (
  echo VsDevCmd failed
  exit /b 1
)
echo === toolchain ===
where cl
where msbuild
set PYTHON=C:\Users\bugas\AppData\Local\Programs\Python\Python312\python.exe
echo PYTHON=%PYTHON%
cd /d F:\Projects\AquaLamp
echo === npm install noble ===
call npm install --foreground-scripts --include=optional @abandonware/noble@1.9.2-26 -w @aqualamp/controller
echo npm_exit=%ERRORLEVEL%
if exist "node_modules\@abandonware\noble" (
  echo noble_dir=OK
) else (
  echo noble_dir=MISSING
)
exit /b %ERRORLEVEL%
