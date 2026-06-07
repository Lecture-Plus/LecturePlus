Dim sh : Set sh = CreateObject("WScript.Shell")
Dim bat : bat = Replace(WScript.ScriptFullName, ".vbs", ".bat")
sh.Run Chr(34) & bat & Chr(34), 0, False
