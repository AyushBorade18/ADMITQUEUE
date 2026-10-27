@echo off
REM Windows: compiles the C++ engine with g++ (no Node.js needed for this step).
REM Run from the project folder:   scripts\build-engine.bat
setlocal
cd /d "%~dp0\.."
where g++ >nul 2>nul
if errorlevel 1 (
  echo ERROR: g++ was not found. Install MSYS2 / WinLibs, add its bin folder to PATH and open a NEW terminal.
  exit /b 1
)
if not exist engine\build mkdir engine\build
echo Building engine\build\admitqueue_engine.exe ...
g++ -std=c++17 -O2 -Wall -Wextra -Iengine\include engine\src\*.cpp -o engine\build\admitqueue_engine.exe -static
if errorlevel 1 (
  echo ERROR: compilation failed.
  exit /b 1
)
echo {"op":"health"}| engine\build\admitqueue_engine.exe
echo.
echo OK: engine\build\admitqueue_engine.exe
