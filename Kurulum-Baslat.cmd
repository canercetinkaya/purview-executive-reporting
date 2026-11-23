@echo off
REM ============================================================
REM  Purview Reporting - Kurulum Baslatici
REM  Yurutme politikasini yalnizca bu oturum icin devre disi
REM  birakir ve indirilen dosyalarin engelini kaldirir.
REM ============================================================
title Purview Reporting - Kurulum Sihirbazi

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-ChildItem -Path '%~dp0' -Filter *.ps1 | Unblock-File; Get-ChildItem -Path '%~dp0' -Filter *.cmd | Unblock-File"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-PurviewReport.ps1"

echo.
pause
