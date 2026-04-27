# Sync @chatfunnel/core build to consumer repos (Windows / PowerShell)
# Uso: ./sync-core.ps1
# Requer: PowerShell 5.1+ ou PowerShell 7+

$ErrorActionPreference = "Stop"

$ROOT     = "D:\Code\4-Vinicius\Chatfunnel"
$CORE         = "$ROOT\chatfunnel-core"
$SERVICES     = "$ROOT\chatfunnel-services"
$API          = "$ROOT\chatfunnel-api"
$EXTERNAL_API = "$ROOT\chatfunnel-external-api"

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

Sync-Core $SERVICES     "chatfunnel-services"
Sync-Core $API          "chatfunnel-api"
Sync-Core $EXTERNAL_API "chatfunnel-external-api"

function Regenerate-Prisma($target, $name) {
    Write-Host "Regenerating Prisma client in $name..." -ForegroundColor Cyan
    Push-Location $target
    npx prisma generate --schema=node_modules/@chatfunnel/core/prisma/schema.prisma
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) {
        Write-Host "WARN: Prisma generate failed in $name (code $code). Provavel causa: '$name' esta rodando e o .dll esta travado. Pare o processo e rode de novo se precisar." -ForegroundColor Yellow
        return $false
    }
    return $true
}

$servicesOk    = Regenerate-Prisma $SERVICES     "chatfunnel-services"
$apiOk         = Regenerate-Prisma $API          "chatfunnel-api"
$externalApiOk = Regenerate-Prisma $EXTERNAL_API "chatfunnel-external-api"

Write-Host ""
Write-Host "Sync summary:" -ForegroundColor Cyan
Write-Host ("  services     prisma generate: {0}" -f $(if ($servicesOk)    { 'OK' } else { 'FAILED' }))
Write-Host ("  api          prisma generate: {0}" -f $(if ($apiOk)         { 'OK' } else { 'FAILED' }))
Write-Host ("  external-api prisma generate: {0}" -f $(if ($externalApiOk) { 'OK' } else { 'FAILED' }))
Write-Host "Done. Restart services and api." -ForegroundColor Green
