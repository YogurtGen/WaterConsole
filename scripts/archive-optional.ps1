param([Parameter(Mandatory=$true)][string]$Stage,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Archive\Microsoft.PowerShell.Archive.psd1')
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$taskStage=[IO.Path]::GetFullPath($Stage)
$taskOutput=[IO.Path]::GetFullPath($OutputPath)
if($taskStage -ne (Join-Path $taskRoot '.local\optional-package') -or -not $taskOutput.StartsWith($taskRoot+'\releases\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected optional package path.'}
Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $taskStage -File).FullName -DestinationPath $taskOutput -Force

