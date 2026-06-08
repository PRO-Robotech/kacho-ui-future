$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$HostDir = Join-Path $Root "host"
$DashboardDir = Join-Path $Root "dashboard"
$RemoteEntry = Join-Path $DashboardDir "dist\assets\remoteEntry.js"

$jobs = @()

function Stop-WorkspaceListener {
  param(
    [Parameter(Mandatory = $true)] [int] $Port
  )

  $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $processId = $listener.OwningProcess
    if (-not $processId) {
      continue
    }

    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if (-not $proc -or $proc.CommandLine -notlike "*$Root*") {
      throw "Port $Port is already in use by process $processId outside this workspace. Stop it or change ports."
    }

    Write-Host "Stopping stale workspace process $processId on port $Port..."
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

function Start-NpmJob {
  param(
    [Parameter(Mandatory = $true)] [string] $Name,
    [Parameter(Mandatory = $true)] [string] $WorkingDirectory,
    [Parameter(Mandatory = $true)] [string] $Script
  )

  Start-Job -Name $Name -ScriptBlock {
    param($Dir, $NpmScript)
    Set-Location $Dir
    npm run $NpmScript 2>&1
  } -ArgumentList $WorkingDirectory, $Script
}

function Stop-DevJobs {
  if ($jobs.Count -eq 0) {
    return
  }

  Write-Host ""
  Write-Host "Stopping federated dev jobs..."
  $jobs | Stop-Job -ErrorAction SilentlyContinue
  $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
}

trap {
  Stop-DevJobs
  throw $_
}

Stop-WorkspaceListener -Port 4175
Stop-WorkspaceListener -Port 5174
Stop-WorkspaceListener -Port 5175

Write-Host "Building dashboard remote once..."
Push-Location $DashboardDir
try {
  npm run build
}
finally {
  Pop-Location
}

Write-Host "Starting dashboard build watcher..."
$jobs += Start-NpmJob -Name "dashboard:watch" -WorkingDirectory $DashboardDir -Script "dev:remote:watch"

Write-Host "Waiting for dashboard remote entry..."
$deadline = (Get-Date).AddSeconds(60)
while (-not (Test-Path $RemoteEntry)) {
  if ((Get-Date) -gt $deadline) {
    throw "Timed out waiting for $RemoteEntry"
  }
  Receive-Job -Job $jobs | ForEach-Object { Write-Host $_ }
  Start-Sleep -Milliseconds 500
}

Write-Host "Starting dashboard preview on http://localhost:4175 ..."
$jobs += Start-NpmJob -Name "dashboard:preview" -WorkingDirectory $DashboardDir -Script "preview"

Write-Host "Starting host dev on http://localhost:5174 ..."
$jobs += Start-NpmJob -Name "host:dev" -WorkingDirectory $HostDir -Script "dev"

Write-Host ""
Write-Host "Federated dev is running:"
Write-Host "  host             http://localhost:5174"
Write-Host "  dashboard remote http://localhost:4175/assets/remoteEntry.js"
Write-Host ""
Write-Host "Press Ctrl+C to stop all jobs."

try {
  while ($true) {
    foreach ($job in $jobs) {
      Receive-Job -Job $job | ForEach-Object { Write-Host "[$($job.Name)] $_" }
      if ($job.State -in @("Failed", "Stopped", "Completed")) {
        throw "Job '$($job.Name)' stopped with state $($job.State)."
      }
    }
    Start-Sleep -Seconds 1
  }
}
finally {
  Stop-DevJobs
}
