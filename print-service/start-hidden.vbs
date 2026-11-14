Set fso = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = strPath

' Compatibilidade com atalhos antigos desta copia do projeto.
objShell.Run "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & strPath & "\manage.ps1"" -Action Start", 0, False
