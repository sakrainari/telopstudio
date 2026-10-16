@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python is required only for this local preview server.
  echo You can also upload these files to GitHub Pages.
  pause
  exit /b 1
)
echo Open http://localhost:8766 in your browser.
echo Press Ctrl+C to stop the local server.
start "" "http://localhost:8766"
python -m http.server 8766 --bind 127.0.0.1
pause
