@echo off
REM ============================================================
REM  KasirKu - Launcher
REM  Menjalankan 1 server (backend + frontend build) lalu buka browser.
REM ============================================================
setlocal
cd /d "%~dp0"

REM Pastikan build frontend tersedia
if not exist "dist\index.html" (
  echo [KasirKu] dist\index.html tidak ditemukan.
  echo [KasirKu] Menjalankan "npm run build" dulu...
  call npm run build
)

echo [KasirKu] Menjalankan server di port 3000...
start "KasirKu Server" /min cmd /c "npx tsx server.ts"

REM Tunggu sampai port 3000 siap (maksimal ~30 detik)
echo [KasirKu] Menunggu server siap...
set /a tries=0
:waitloop
set /a tries+=1
powershell -NoProfile -Command "try{ (New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',3000); exit 0 }catch{ exit 1 }" >nul 2>&1
if %errorlevel%==0 goto ready
if %tries% GEQ 30 goto timeout
timeout /t 1 /nobreak >nul
goto waitloop

:ready
echo [KasirKu] Server siap. Membuka browser...
start "" "http://localhost:3000"
goto end

:timeout
echo [KasirKu] PERINGATAN: server tidak merespons di port 3000 dalam 30 detik.
echo [KasirKu] Cek jendela "KasirKu Server" untuk pesan error.

:end
endlocal
