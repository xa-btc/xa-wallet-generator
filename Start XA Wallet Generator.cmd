@echo off
cd /d "%~dp0"
if not exist node_modules call npm ci
call npm run build
if errorlevel 1 goto done
call npm run preview -- --open
:done
pause
