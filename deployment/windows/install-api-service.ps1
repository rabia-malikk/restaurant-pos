param(
  [Parameter(Mandatory = $true)]
  [string]$NssmPath,
  [Parameter(Mandatory = $true)]
  [string]$ApiDirectory,
  [string]$ServiceName = 'HawtPosApi',
  [string]$NodePath = 'C:\Program Files\nodejs\node.exe'
)

$ErrorActionPreference = 'Stop'
$apiRoot = (Resolve-Path $ApiDirectory).Path
$nodeExecutable = (Resolve-Path $NodePath).Path
$nssmExecutable = (Resolve-Path $NssmPath).Path
$entryPoint = Join-Path $apiRoot 'server\index.mjs'
$environmentFile = Join-Path $apiRoot '.env'
$logDirectory = Join-Path $apiRoot 'logs'

if (-not (Test-Path $entryPoint -PathType Leaf)) {
  throw "API entry point not found: $entryPoint"
}
if (-not (Test-Path $environmentFile -PathType Leaf)) {
  throw "Production .env file not found: $environmentFile"
}
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  throw "Service '$ServiceName' already exists. Update or remove it before installing."
}

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
& $nssmExecutable install $ServiceName $nodeExecutable $entryPoint
if ($LASTEXITCODE -ne 0) { throw 'NSSM could not install the API service.' }

& $nssmExecutable set $ServiceName AppDirectory $apiRoot
if ($LASTEXITCODE -ne 0) { throw 'Could not set the API service working directory.' }
& $nssmExecutable set $ServiceName AppStdout (Join-Path $logDirectory 'api-out.log')
if ($LASTEXITCODE -ne 0) { throw 'Could not configure API standard output logging.' }
& $nssmExecutable set $ServiceName AppStderr (Join-Path $logDirectory 'api-error.log')
if ($LASTEXITCODE -ne 0) { throw 'Could not configure API error logging.' }
& $nssmExecutable set $ServiceName AppRotateFiles 1
if ($LASTEXITCODE -ne 0) { throw 'Could not enable API log rotation.' }
& $nssmExecutable set $ServiceName AppRotateBytes 10485760
if ($LASTEXITCODE -ne 0) { throw 'Could not set the API log rotation size.' }
& $nssmExecutable set $ServiceName AppExit Default Restart
if ($LASTEXITCODE -ne 0) { throw 'Could not configure API service restart behavior.' }
& $nssmExecutable set $ServiceName AppRestartDelay 5000
if ($LASTEXITCODE -ne 0) { throw 'Could not configure API restart delay.' }
& $nssmExecutable set $ServiceName Start SERVICE_AUTO_START
if ($LASTEXITCODE -ne 0) { throw 'Could not configure automatic API service startup.' }
& $nssmExecutable start $ServiceName
if ($LASTEXITCODE -ne 0) { throw 'Could not start the API service.' }

Write-Host "Installed and started '$ServiceName'. Verify the API at http://127.0.0.1:3000/api/health."
