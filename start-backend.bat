@echo off
cd /d "%~dp0"
echo Starting Phoenix Plants Lifesaver backend...
echo.
npm start
echo.
echo Backend stopped. Press any key to close this window.
pause >nul
