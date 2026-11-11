# UniLab-OS 内网一键打包与上线启动脚本 (Windows PowerShell)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host "[1/3] 正在打包前端生产静态资源 (frontend/dist)..." -ForegroundColor Cyan
Push-Location "$ProjectRoot\frontend"
npm run build
Pop-Location

$LocalIPs = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*"
} | Select-Object -ExpandProperty IPAddress

Write-Host "`n[2/3] 前端打包完成！内网其他电脑/终端可通过以下地址直接访问：" -ForegroundColor Green
Write-Host "  - 本机访问:   http://127.0.0.1:8000"
foreach ($ip in $LocalIPs) {
    Write-Host "  - 内网访问:   http://$($ip):8000" -ForegroundColor Yellow
    Write-Host "  - 硬件网关:   http://$($ip):8000/api/v1/ext/..." -ForegroundColor Gray
}
Write-Host "`n提示：若内网其他电脑无法连接，请以管理员身份执行一次防火墙放行命令：" -ForegroundColor DarkCyan
Write-Host '  New-NetFirewallRule -DisplayName "UniLab-OS-8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow'

Write-Host "`n[3/3] 正在启动 UniLab-OS 内网一体化服务 (0.0.0.0:8000)..." -ForegroundColor Cyan
python -m uvicorn backend.main:app --app-dir $ProjectRoot --host 0.0.0.0 --port 8000
