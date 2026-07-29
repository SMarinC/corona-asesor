# Chequeo rápido: ¿siguen vivos los dos servidores de la demo?
# Uso: powershell -ExecutionPolicy Bypass -File check-demo.ps1

try {
    $py = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 3 -UseBasicParsing
    Write-Host "Backend Python (8000): OK" -ForegroundColor Green
} catch {
    Write-Host "Backend Python (8000): CAÍDO — corre start-demo.ps1 de nuevo" -ForegroundColor Red
}

try {
    $node = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 3 -UseBasicParsing
    Write-Host "Frontend Node (3000): OK" -ForegroundColor Green
} catch {
    Write-Host "Frontend Node (3000): CAÍDO — corre start-demo.ps1 de nuevo" -ForegroundColor Red
}
