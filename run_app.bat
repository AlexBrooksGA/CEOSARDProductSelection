@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js 22.12 or newer is required: https://nodejs.org/
    exit /b 1
)

rem Install exact locked dependencies when node_modules is missing or the lockfile changed.
fc /b "package-lock.json" "node_modules\.package-lock.snapshot" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    call npm ci
    if errorlevel 1 exit /b 1
    copy /y "package-lock.json" "node_modules\.package-lock.snapshot" >nul
)

echo Building the production app...
call npm run build
if errorlevel 1 exit /b 1

if "%PORT%"=="" set PORT=3000
echo Starting on http://localhost:%PORT% (Ctrl+C to stop)
start "" "http://localhost:%PORT%"
call npm start
endlocal
