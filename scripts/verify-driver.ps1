param([Parameter(Mandatory=$true)][string]$DriverPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
$taskSignature=Get-AuthenticodeSignature -LiteralPath $DriverPath
if($taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notlike '*Nefarius Software Solutions*'){throw 'Driver signature does not match the verified upstream publisher.'}

