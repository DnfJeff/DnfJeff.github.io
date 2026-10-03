@echo off
cd /d "%~dp0.."
title DNF Content Studio
echo Starting DNF Content Studio...
set PYTHONDONTWRITEBYTECODE=1
python tools\studio.py
if errorlevel 1 pause
