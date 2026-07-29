# Levanta los dos servidores que necesita la demo de Corona Asesor:
#   - Backend Python (FastAPI/uvicorn, puerto 8000): el agente real
#   - Frontend Node (Next.js, puerto 3000): la interfaz
#
# Cada uno se abre en su PROPIA ventana de PowerShell, así puedes ver los
# logs de cada uno por separado y si algo falla, sabes cuál fue.
#
# Uso: desde la raíz del repo, clic derecho > "Ejecutar con PowerShell",
# o en una terminal: powershell -ExecutionPolicy Bypass -File start-demo.ps1

$repoRoot = $PSScriptRoot
$webDir = Join-Path $repoRoot "web"

Write-Host "Iniciando backend Python (puerto 8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$repoRoot'; python -m uvicorn api_server:app --port 8000"

Write-Host "Iniciando frontend Node (puerto 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$webDir'; npm run dev"

Write-Host "Esperando a que ambos respondan..." -ForegroundColor Yellow

$pythonOk = $false
$nodeOk = $false
$intentos = 0
$maxIntentos = 30

while ((-not $pythonOk -or -not $nodeOk) -and $intentos -lt $maxIntentos) {
    Start-Sleep -Seconds 2
    $intentos++

    if (-not $pythonOk) {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 3 -UseBasicParsing
            if ($resp.StatusCode -eq 200) { $pythonOk = $true; Write-Host "Backend Python listo." -ForegroundColor Green }
        } catch {}
    }

    if (-not $nodeOk) {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 3 -UseBasicParsing
            if ($resp.StatusCode -eq 200) { $nodeOk = $true; Write-Host "Frontend Node listo." -ForegroundColor Green }
        } catch {}
    }
}

if ($pythonOk -and $nodeOk) {
    Write-Host ""
    Write-Host "Todo listo. Abre http://localhost:3000 en tu navegador." -ForegroundColor Green
    Start-Process "http://localhost:3000"
} else {
    Write-Host ""
    Write-Host "Algo no arrancó a tiempo (Python: $pythonOk, Node: $nodeOk)." -ForegroundColor Red
    Write-Host "Revisa las dos ventanas de PowerShell que se abrieron para ver el error." -ForegroundColor Red
}
