param([Parameter(Mandatory=$true)][string]$FilePath,[Parameter(Mandatory=$true)][int]$ApplicationId)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$deadline=[DateTime]::UtcNow.AddSeconds(20)
$dialog=$null
while ([DateTime]::UtcNow -lt $deadline) {
  $windows=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$ApplicationId)))
  foreach($candidate in $windows) {
    if ($candidate.Current.ClassName -eq '#32770') { $dialog=$candidate; break }
    $owned=$candidate.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'#32770')))
    if ($null -ne $owned) { $dialog=$owned; break }
  }
  if ($null -ne $dialog) { break }
  Start-Sleep -Milliseconds 100
}
if ($null -eq $dialog) {
  $all=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
  throw ('Native file picker did not appear for PID '+$ApplicationId+'. Windows: '+(($all | ForEach-Object { $_.Current.Name+' ['+$_.Current.ClassName+', PID '+$_.Current.ProcessId+']' }) -join '; '))
}
$fileName=$null
while ([DateTime]::UtcNow -lt $deadline) {
  $edits=$dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)))
  foreach($edit in $edits) { if ($edit.Current.Name -match 'File name|N.zov s.boru|N.zev s.boru' -or $edit.Current.AutomationId -eq '1148') { $fileName=$edit; break } }
  if ($null -ne $fileName) { break }
  Start-Sleep -Milliseconds 100
}
if ($null -eq $fileName) { throw ('File-name input not found in '+$dialog.Current.Name+': '+ (($edits | ForEach-Object { $_.Current.Name+' ['+$_.Current.AutomationId+']' }) -join ', ')) }
$pattern=$fileName.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
$pattern.SetValue([IO.Path]::GetFullPath($FilePath))
$open=$dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.AndCondition((New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)),(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1')))))
if ($null -eq $open) { throw 'Open button not found.' }
$open.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
