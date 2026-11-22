@echo off
rem Double-click launcher of demo-up.ps1 (docs/demo-script.md). -ExecutionPolicy Bypass applies to this process
rem only: the execution policy of the machine does not change. Arguments are passed on: demo-up.cmd -LocalOnly
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0demo-up.ps1" %*
echo.
pause
