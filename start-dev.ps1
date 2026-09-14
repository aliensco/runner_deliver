$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$runnerNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$runnerNode = if ($runnerNodeCommand) { $runnerNodeCommand.Source } else {
    Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
}
if (-not (Test-Path -LiteralPath $runnerNode)) {
    throw 'Install Node.js 22.12+ (with npm), then run npm ci.'
}
if (-not (Test-Path -LiteralPath 'node_modules/concurrently/dist/bin/index.js')) {
    throw 'Dependencies are missing. Run npm ci in this folder first.'
}

Write-Host 'Preview: http://127.0.0.1:5173   API: http://127.0.0.1:3000'
Write-Host 'Press Ctrl+C to stop both services.'
& $runnerNode 'node_modules/concurrently/dist/bin/index.js' --kill-others -n api,web `
    "`"$runnerNode`" node_modules/tsx/dist/cli.mjs watch src/server/index.ts" `
    "`"$runnerNode`" node_modules/vite/bin/vite.js --host 127.0.0.1 --strictPort"
exit $LASTEXITCODE
