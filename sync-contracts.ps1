# Sync @chatfunnel/contracts build to consumer repos (Windows / PowerShell)
# Uso: ./sync-contracts.ps1
# Requer: PowerShell 5.1+ ou PowerShell 7+

$ErrorActionPreference = "Stop"

$ROOT      = "D:\Code\4-Vinicius\Chatfunnel"
$CONTRACTS = "$ROOT\chatfunnel-contracts"

$consumers = @(
    @{ Path = "$ROOT\chatfunnel-services"; Name = "chatfunnel-services" }
    @{ Path = "$ROOT\chatfunnel-mcp";      Name = "chatfunnel-mcp" }
    @{ Path = "$ROOT\chatfunnel-front";    Name = "chatfunnel-front" }
)

Write-Host "Building chatfunnel-contracts..." -ForegroundColor Cyan
Push-Location $CONTRACTS
npm run build
if ($LASTEXITCODE -ne 0) { throw "Contracts build failed" }
Pop-Location

function Sync-Contracts($target, $name) {
    $dest = "$target\node_modules\@chatfunnel\contracts"

    if (-not (Test-Path "$target\node_modules")) {
        Write-Host "  SKIP $name (no node_modules)" -ForegroundColor Yellow
        return "SKIP"
    }

    if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }

    Copy-Item -Path "$CONTRACTS\dist"         -Destination "$dest\dist"         -Recurse -Force
    Copy-Item -Path "$CONTRACTS\package.json" -Destination "$dest\package.json" -Force

    Write-Host "  OK $name" -ForegroundColor Green
    return "OK"
}

Write-Host ""
Write-Host "Syncing dist to consumers..." -ForegroundColor Cyan

$results = @{}
foreach ($c in $consumers) {
    $results[$c.Name] = Sync-Contracts $c.Path $c.Name
}

Write-Host ""
Write-Host "Sync summary:" -ForegroundColor Cyan
foreach ($c in $consumers) {
    $status = $results[$c.Name]
    $color = if ($status -eq "OK") { "Green" } elseif ($status -eq "SKIP") { "Yellow" } else { "Red" }
    Write-Host ("  {0,-30} {1}" -f $c.Name, $status) -ForegroundColor $color
}
Write-Host "Done." -ForegroundColor Green
