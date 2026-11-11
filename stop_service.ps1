# UniLab-OS 一键停止前后端后台服务脚本 (Windows PowerShell)
$Ports = @(8000, 5173)
$Stopped = $false

$Pids = Get-NetTCPConnection -LocalPort $Ports -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -gt 4 } |
    Select-Object -ExpandProperty OwningProcess -Unique

foreach ($PidToKill in $Pids) {
    $Proc = Get-Process -Id $PidToKill -ErrorAction SilentlyContinue
    if ($Proc -and $Proc.ProcessName -in @("python", "python3", "uvicorn", "node")) {
        Stop-Process -Id $PidToKill -Force -ErrorAction SilentlyContinue
        Write-Host "已停止 $($Proc.ProcessName) 服务进程 (PID: $PidToKill)" -ForegroundColor Green
        $Stopped = $true
    }
}

if (-not $Stopped) {
    Write-Host "当前没有正在运行的 UniLab-OS 服务 (端口 8000 / 5173 均已释放)。" -ForegroundColor Yellow
}
