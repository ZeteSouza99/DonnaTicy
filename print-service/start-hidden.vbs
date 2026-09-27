Set fso = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = strPath

' Usar node portatil se existir, senao node do sistema
If fso.FileExists(strPath & "\node.exe") Then
    objShell.Run """" & strPath & "\node.exe"" server.js", 0, False
Else
    objShell.Run "node server.js", 0, False
End If
