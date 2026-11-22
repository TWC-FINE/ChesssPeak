@echo off
rem Double-click launcher of demo-down.ps1. -ExecutionPolicy Bypass applies to this process only.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0demo-down.ps1" %*
echo.
pause
