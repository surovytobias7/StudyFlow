param([Parameter(Mandatory=$true)][string]$FilePath,[Parameter(Mandatory=$true)][int]$ApplicationId)
$ErrorActionPreference='Stop'
# Only operate on the dialog owned by the isolated test process.
# Native IDs avoid localized UI Automation providers omitting filename controls.
Add-Type @'
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
public static class StudyPickerNative {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc c, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, EnumProc c, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,StringBuilder s,int n);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,string l);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
  public static string Class(IntPtr h) {var s=new StringBuilder(256);GetClassName(h,s,256);return s.ToString();}
  public static IntPtr Dialog(uint pid) {
    IntPtr result=IntPtr.Zero;
    EnumWindows((h,p)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner==pid && Class(h)=="#32770"){result=h;return false;}return true;},IntPtr.Zero);
    return result;
  }
  public static IntPtr Filename(IntPtr dialog) {
    IntPtr result=IntPtr.Zero;
    EnumChildWindows(dialog,(h,p)=>{int id=GetDlgCtrlID(h), parent=GetDlgCtrlID(GetParent(h));
      if(Class(h)=="Edit" && (id==1148 || id==1152 || parent==1148 || parent==1152)){result=h;return false;}return true;},IntPtr.Zero);
    return result;
  }
  public static string Controls(IntPtr dialog) {
    var entries=new List<string>();
    EnumChildWindows(dialog,(h,p)=>{entries.Add(Class(h)+" id="+GetDlgCtrlID(h)+" parent="+GetDlgCtrlID(GetParent(h)));return true;},IntPtr.Zero);
    return string.Join("; ",entries);
  }
}
'@
$deadline=[DateTime]::UtcNow.AddSeconds(20)
$dialogHandle=[IntPtr]::Zero
$filenameHandle=[IntPtr]::Zero
while ([DateTime]::UtcNow -lt $deadline) {
  $dialogHandle=[StudyPickerNative]::Dialog([uint32]$ApplicationId)
  if ($dialogHandle -ne [IntPtr]::Zero) {
    $filenameHandle=[StudyPickerNative]::Filename($dialogHandle)
    if ($filenameHandle -ne [IntPtr]::Zero) { break }
  }
  Start-Sleep -Milliseconds 100
}
if ($filenameHandle -eq [IntPtr]::Zero) {
  throw ('Native filename control unavailable for test PID '+$ApplicationId+'. '+[StudyPickerNative]::Controls($dialogHandle))
}
$openHandle=[StudyPickerNative]::GetDlgItem($dialogHandle,1)
if ($openHandle -eq [IntPtr]::Zero) { throw 'Native Open button unavailable.' }
[void][StudyPickerNative]::SendMessage($filenameHandle,0x000C,[IntPtr]::Zero,[IO.Path]::GetFullPath($FilePath))
[void][StudyPickerNative]::PostMessage($openHandle,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero)
