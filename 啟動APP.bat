@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 set "PATH=C:\Users\mike\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"

if not exist "%~dp0node_modules\.bin\vite.CMD" (
  echo 找不到 node_modules，請先在此資料夾執行 npm install。
  pause
  exit /b 1
)

start "資產槓桿 APP Server" /min cmd /c ""%~dp0node_modules\.bin\vite.CMD" --host 127.0.0.1 --port 5173"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5173/"

echo APP 已啟動：http://127.0.0.1:5173/
echo 關閉這個視窗不會停止背景伺服器；請在工作管理員結束 node.exe，或重新啟動電腦。
endlocal
