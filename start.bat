@echo off
REM One-click local start for Hei Gallery on Windows.
cd /d "%~dp0"

echo -- Hei Gallery * one-click start --

where docker >nul 2>nul
if errorlevel 1 (
  echo.
  echo Docker is not installed.
  echo Please install Docker Desktop first: https://www.docker.com/products/docker-desktop/
  pause
  exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
  echo.
  echo Docker is installed but not running.
  echo Please open Docker Desktop, wait for it to start, then run this script again.
  pause
  exit /b 1
)

if not exist .env (
  echo First run -- creating .env with a secure session password...
  copy /Y .env.example .env >nul
  for /f "delims=" %%P in ('powershell -NoProfile -Command "[Convert]::ToBase64String((1..48 ^| ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))"') do set PW=%%P
  powershell -NoProfile -Command "(Get-Content .env) -replace '^SESSION_PASSWORD=.*', 'SESSION_PASSWORD=%PW%' | Set-Content .env"
  echo   -> .env created.
)

powershell -NoProfile -Command "(Get-Content .env) -replace '^PORT=.*', 'PORT=6765' -replace '^NEXT_PUBLIC_SITE_URL=.*', 'NEXT_PUBLIC_SITE_URL=http://localhost:6765' | Set-Content .env"

echo.
echo Building and starting the site (first run may take a few minutes)...
docker compose up -d --build

echo.
echo Waiting for the site to come up...
for /L %%i in (1,1,60) do (
  powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -Uri http://localhost:6765 -TimeoutSec 2) ^| Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto :ready
  timeout /t 2 >nul
)

:ready
echo.
echo Hei Gallery is running at:  http://localhost:6765
echo First-time admin setup:    http://localhost:6765/admin
echo.
echo To stop the site later, run: stop.bat
start http://localhost:6765
