' ============================================================
'  KasirKu - Silent Launcher (VBS)
'  Menjalankan start-kasirku.bat TANPA menampilkan jendela cmd.
'  Hanya browser yang muncul.
'
'  PENTING: file ini memakai PATH ABSOLUT ke folder project,
'  jadi tetap bekerja walau di-copy ke folder lain
'  (mis. folder Startup Windows).
' ============================================================

' ---- PATH PROJECT (hardcode, absolut) ----
PROJECT_DIR = "C:\Users\Rumah\Documents\Mirza All\kasirku"

Set objShell = CreateObject("WScript.Shell")
Set objFSO   = CreateObject("Scripting.FileSystemObject")

If Not objFSO.FolderExists(PROJECT_DIR) Then
  MsgBox "Folder project KasirKu tidak ditemukan:" & vbCrLf & PROJECT_DIR & vbCrLf & vbCrLf & _
         "Edit start-kasirku-silent.vbs dan sesuaikan PROJECT_DIR ke lokasi project yang benar.", _
         16, "KasirKu - Error"
  WScript.Quit 1
End If

BAT_PATH = PROJECT_DIR & "\start-kasirku.bat"

If Not objFSO.FileExists(BAT_PATH) Then
  MsgBox "start-kasirku.bat tidak ditemukan di:" & vbCrLf & BAT_PATH, 16, "KasirKu - Error"
  WScript.Quit 1
End If

' 0 = sembunyikan jendela, False = jangan tunggu (VBS langsung selesai)
objShell.Run """" & BAT_PATH & """", 0, False

Set objFSO = Nothing
Set objShell = Nothing
