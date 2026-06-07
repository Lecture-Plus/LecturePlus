@echo off
cd /d "%~dp0"

:: ── Trouver Chrome ou Edge installé ─────────────────────────────────────────
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"  set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"        set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe"         set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"   set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"         set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

set "PROFILE=%~dp0.chrome-profile"
set "URL=http://localhost:8000"

:: ── Si le serveur tourne déjà ET répond, ouvrir directement ───────────────
netstat -ano | findstr ":8000" > nul 2>&1
if %errorlevel% neq 0 goto start_server

powershell -Command "try { $null=(Invoke-WebRequest -Uri 'http://localhost:8000' -TimeoutSec 2 -UseBasicParsing); exit 0 } catch { exit 1 }" > nul 2>&1
if %errorlevel% == 0 goto open

:: Port occupé mais serveur mort → tuer le processus fantôme
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 "') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak > nul

:start_server
::  ── Lancer le serveur en arrière-plan (fenêtre totalement masquée) ──────────
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden" 2>nul
if %errorlevel% neq 0 start "" /min cmd /c "cd /d ""%~dp0"" && node server.js"

:: ── Attendre que le serveur réponde (max 30s) ────────────────────────────────
set /a tries=0
:wait
timeout /t 1 /nobreak > nul
set /a tries+=1
if %tries% geq 30 goto err
netstat -ano | findstr ":8000" > nul 2>&1
if %errorlevel% neq 0 goto wait
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{(New-Object Net.WebClient).DownloadString('http://localhost:8000')|Out-Null;exit 0}catch{exit 1}" > nul 2>&1
if %errorlevel% neq 0 goto wait

:open
if "%BROWSER%"=="" goto fallback
:: Sans --user-data-dir : Chrome utilise son profil par defaut
:: = meme cache V8 que votre Chrome habituel = performances identiques
start "" "%BROWSER%" "--app=%URL%" "--window-size=1694,1073" "--no-first-run"
exit

:fallback
:: Ni Chrome ni Edge → navigateur par défaut (barre d'URL visible)
start "" "%URL%"
exit

:err
mshta vbscript:Execute("MsgBox ""Lecture+ : le serveur n'a pas pu démarrer."&Chr(13)&Chr(10)&""Vérifiez que Node.js est installé, puis relancez l'application."",16,""Lecture+ - Erreur"":close")
exit

:err
echo.
echo ERREUR : le serveur n'a pas demarré après 15 secondes.
pause
echo Double-cliquez sur server.exe pour voir l'erreur.
pause
exit
