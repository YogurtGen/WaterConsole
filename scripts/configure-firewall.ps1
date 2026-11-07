param(
  [Parameter(Mandatory=$true)][string]$ExecutablePath,
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$taskExecutable = [IO.Path]::GetFullPath($ExecutablePath)
if ([IO.Path]::GetFileName($taskExecutable) -ne 'WaterConsole Core.exe') { throw 'Expected WaterConsole Core.exe.' }
if (-not $Remove -and -not (Test-Path -LiteralPath $taskExecutable -PathType Leaf)) { throw 'WaterConsole Core.exe was not found.' }
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$taskPrincipal = [Security.Principal.WindowsPrincipal]::new($taskIdentity)
if (-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $taskArguments = @('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-ExecutablePath',('"'+$taskExecutable+'"'))
  if ($Remove) { $taskArguments += '-Remove' }
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList $taskArguments -Wait
  exit
}
$taskHash = [Convert]::ToBase64String([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($taskExecutable.ToLowerInvariant()))).Replace('/','').Replace('+','').TrimEnd('=')
$taskRuleName = 'WaterConsole-Core-LAN-'+$taskHash.Substring(0,16)
Get-NetFirewallRule -Name $taskRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if (-not $Remove) {
  New-NetFirewallRule -Name $taskRuleName -DisplayName 'WaterConsole Core local controllers' -Group 'WaterConsole Core' -Program $taskExecutable -Direction Inbound -Action Allow -Protocol TCP -Profile Private -RemoteAddress LocalSubnet -EdgeTraversalPolicy Block | Out-Null
}
