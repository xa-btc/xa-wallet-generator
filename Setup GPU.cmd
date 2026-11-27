@echo off
cd /d "%~dp0"
if not exist .gpu-venv\Scripts\python.exe python -m venv .gpu-venv
if errorlevel 1 goto done
.gpu-venv\Scripts\python.exe -m pip install -r gpu\requirements.txt
if errorlevel 1 goto done
.gpu-venv\Scripts\python.exe gpu\engine.py --devices
:done
pause
