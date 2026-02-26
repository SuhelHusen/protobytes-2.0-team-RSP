@echo off
REM AI Study Planner - Development Startup Script (Batch version)
REM This script starts both backend and frontend servers

echo.
echo ========================================
echo   AI Study Planner - Starting Servers
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Get Node.js version
for /f "delims=" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js version: %NODE_VERSION%

REM Set directories
set BACKEND_DIR=%~dp0backend
set FRONTEND_DIR=%~dp0frontend

REM Check if directories exist
if not exist "%BACKEND_DIR%" (
    echo [ERROR] Backend directory not found
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%" (
    echo [ERROR] Frontend directory not found
    pause
    exit /b 1
)

REM Check and install backend dependencies
if not exist "%BACKEND_DIR%\node_modules" (
    echo [INFO] Installing backend dependencies...
    cd /d "%BACKEND_DIR%"
    call npm install
)

REM Check and install frontend dependencies
if not exist "%FRONTEND_DIR%\node_modules" (
    echo [INFO] Installing frontend dependencies...
    cd /d "%FRONTEND_DIR%"
    call npm install
)

echo.
echo [INFO] Launching servers in separate windows...
echo.

REM Start backend server in new window
start "Backend (Port 3001)" cmd /k "cd /d %BACKEND_DIR% && echo. && echo ======================================== && echo   Backend Server && echo ======================================== && echo. && npm run dev"

REM Wait 2 seconds
timeout /t 2 /nobreak >nul

REM Start frontend server in new window
start "Frontend (Port 3000)" cmd /k "cd /d %FRONTEND_DIR% && echo. && echo ======================================== && echo   Frontend Server && echo ======================================== && echo. && npm run dev"

echo.
echo ========================================
echo   Servers Starting!
echo ========================================
echo.
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:3000
echo.
echo Press any key to close this window...
pause >nul
