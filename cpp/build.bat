@echo off
rem Compiles every C++ program in this folder into cpp\build\   (needs g++ from MinGW / MSYS2 on PATH)
cd /d "%~dp0"
if not exist build mkdir build
echo Building the engine ...
g++ -std=c++11 -O2 -Wall engine\main.cpp -o build\engine.exe || goto :fail
for %%f in (demos\*.cpp) do (
  echo Building %%~nf ...
  g++ -std=c++11 -O2 -Wall "%%f" -o "build\%%~nf.exe" || goto :fail
)
echo Done. Run for example:  build\02_linked_list_demo.exe   or   build\08_allotment_demo.exe
goto :eof
:fail
echo Build failed. Is g++ installed and on PATH?  (try: g++ --version)
exit /b 1
