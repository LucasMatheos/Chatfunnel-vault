# Sync @chatfunnel/core build to consumer repos (Windows / PowerShell)
# Uso: ./sync-core.ps1
# Requer: PowerShell 5.1+ ou PowerShell 7+

$ErrorActionPreference = "Stop"

$ROOT     = "D:\Code\4-Vinicius\Chatfunnel"
$CORE     = "$ROOT\chatfunnel-core"
$SERVICES = "$ROOT\chatfunnel-services"
$API      = "$ROOT\chatfunnel-api"

Write-Host "Building chatfunnel-core..." -ForegroundColor Cyan
Push-Location $CORE
npm run build
if ($LASTEXITCODE -ne 0) { throw "Core build failed" }
Pop-Location

function Sync-Core($target, $name) {
    Write-Host "Syncing dist to $name..." -ForegroundColor Cyan
    $destDist   = "$target\node_modules\@chatfunnel\core\dist"
    $destPrisma = "$target\node_modules\@chatfunnel\core\prisma"

    if (-not (Test-Path $destDist))   { New-Item -ItemType Directory -Force -Path $destDist   | Out-Null }
    if (-not (Test-Path $destPrisma)) { New-Item -ItemType Directory -Force -Path $destPrisma | Out-Null }

    Copy-Item -Path "$CORE\dist\*"              -Destination $destDist   -Recurse -Force
    Copy-Item -Path "$CORE\prisma\schema.prisma" -Destination "$destPrisma\schema.prisma" -Force
}

Sync-Core $SERVICES "chatfunnel-services"
Sync-Core $API      "chatfunnel-api"

Write-Host "Regenerating Prisma client in chatfunnel-services..." -ForegroundColor Cyan
Push-Location $SERVICES
npx prisma generate --schema=node_modules/@chatfunnel/core/prisma/schema.prisma
if ($LASTEXITCODE -ne 0) { throw "Prisma generate failed in services" }
Pop-Location

Write-Host "Done. Restart services and api." -ForegroundColor Green
