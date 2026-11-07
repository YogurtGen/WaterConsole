param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$taskOutput = [IO.Path]::GetFullPath($OutputPath)
if (-not $taskOutput.StartsWith($taskRoot + '\releases\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Source archive must be under project releases.' }
if (Test-Path -LiteralPath $taskOutput) { throw 'Refusing to overwrite an archive.' }
$taskRootNames = @('AGENTS.md','CLAUDE.md','README.md','CONTRIBUTING.md','LICENSE','SECURITY.md','.gitignore','.npmrc','package.json','package-lock.json','tsconfig.json','vite.config.ts','vitest.config.ts')
$taskFolders = @('assets','docs','scripts','src','tests','toolkit','.github')
$taskFiles = [Collections.Generic.List[IO.FileInfo]]::new()
function Add-PublicFiles([string]$Directory) {
  foreach ($taskEntry in Get-ChildItem -LiteralPath $Directory -Force) {
    if (($taskEntry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Unexpected source junction.' }
    if ($taskEntry.PSIsContainer) { Add-PublicFiles $taskEntry.FullName }
    elseif ($taskEntry.Extension -notin @('.log','.tmp','.pyc')) { $taskFiles.Add($taskEntry) }
  }
}
foreach ($taskName in $taskRootNames) { $taskFiles.Add((Get-Item -LiteralPath (Join-Path $taskRoot $taskName))) }
foreach ($taskFolder in $taskFolders) { $taskDirectory=Join-Path $taskRoot $taskFolder; if(Test-Path -LiteralPath $taskDirectory){ Add-PublicFiles $taskDirectory } }
New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($taskOutput)) -Force | Out-Null
$taskStream = [IO.File]::Open($taskOutput, [IO.FileMode]::CreateNew)
$taskArchive = [IO.Compression.ZipArchive]::new($taskStream, [IO.Compression.ZipArchiveMode]::Create)
try { foreach ($taskFile in $taskFiles) {
  $taskRelative = $taskFile.FullName.Substring($taskRoot.Length + 1).Replace('\','/')
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive,$taskFile.FullName,('WaterConsole/' + $taskRelative),[IO.Compression.CompressionLevel]::Optimal) | Out-Null
} } finally { $taskArchive.Dispose(); $taskStream.Dispose() }
Write-Output ("Archived {0} public source files." -f $taskFiles.Count)
