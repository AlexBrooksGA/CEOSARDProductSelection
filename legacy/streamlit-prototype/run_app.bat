@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Creating Python virtual environment...
    where py >nul 2>&1
    if not errorlevel 1 (
        py -3.11 -m venv .venv
    ) else (
        where python >nul 2>&1
        if errorlevel 1 (
            echo Python 3.11 or newer is required and was not found on PATH.
            exit /b 1
        )
        python -m venv .venv
    )
    if errorlevel 1 exit /b 1
)

call ".venv\Scripts\activate.bat"
if errorlevel 1 exit /b 1

fc /b "requirements.txt" ".venv\requirements.snapshot" >nul 2>&1
if errorlevel 1 (
    echo Installing application requirements...
    python -m pip install --upgrade pip
    if errorlevel 1 exit /b 1
    python -m pip install -r requirements.txt
    if errorlevel 1 exit /b 1
    copy /y "requirements.txt" ".venv\requirements.snapshot" >nul
)

python -m streamlit run app.py
endlocal
