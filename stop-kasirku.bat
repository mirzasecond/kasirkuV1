@echo off
REM ============================================================
REM  KasirKu - Stop Server
REM  Menghentikan server Node KasirKu dengan benar (flush DB dulu).
REM ============================================================
setlocal
echo [KasirKu] Menghentikan server...

REM Cari proses node yang menjalankan server.ts milik folder ini dan hentikan.
powershell -NoProfile -Command ^
  "$procs = Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'server.ts' }; if ($procs) { $procs | ForEach-Object { Write-Host ('  stop PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force } } else { Write-Host '  (tidak ada server yang berjalan)' }"

REM Bersihkan lock file jika server mati paksa
if exist "%~dp0data\kasirku.db.lock" (
  del /f /q "%~dp0data\kasirku.db.lock" >nul 2>&1
  echo [KasirKu] Lock file dibersihkan.
)

echo [KasirKu] Selesai.
endlocal
