Set ws = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
ws.CurrentDirectory = scriptPath
ws.Run "pythonw """ & scriptPath & "\main.py""", 0, False
