@echo off
cd /d "%~dp0"
echo Stopping Hei Gallery...
docker compose down
echo Stopped. Your artworks and database are kept safely in Docker volumes.
pause
