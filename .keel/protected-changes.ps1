# 列出当前分支改动了哪些受保护文件（spec 的四层和骨架自身）。由 keel 管理，不要手改。
# 默认只报告、不失败；加 -Strict 时有改动就返回非零退出码。
[CmdletBinding()]
param(
    [string]$Base,
    [switch]$Strict
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $root
try {
    & git rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host '不是 git 仓库，跳过受保护文件检查。'
        exit 0
    }

    $settings = Get-Content -LiteralPath '.keel/settings.json' -Raw -Encoding utf8 | ConvertFrom-Json
    & git rev-parse --verify --quiet HEAD *> $null
    $hasHead = $LASTEXITCODE -eq 0

    if (-not $Base) {
        $remoteRef = "origin/$($settings.default_branch)"
        & git rev-parse --verify --quiet $remoteRef *> $null
        if ($LASTEXITCODE -eq 0 -and $hasHead) {
            $mergeBase = & git merge-base HEAD $remoteRef
            if ($LASTEXITCODE -eq 0 -and $mergeBase) { $Base = "$mergeBase".Trim() }
        }
        if (-not $Base -and $hasHead) { $Base = 'HEAD' }
    }

    $changed = [System.Collections.Generic.HashSet[string]]::new()
    $lists = @()
    if ($Base) {
        $lists += , @(& git -c core.quotePath=false diff --name-only $Base --)
    }
    else {
        $lists += , @(& git -c core.quotePath=false diff --cached --name-only)
    }
    $lists += , @(& git -c core.quotePath=false ls-files --others --exclude-standard)
    foreach ($list in $lists) {
        foreach ($file in $list) {
            if ($file) { [void]$changed.Add("$file".Trim()) }
        }
    }

    $patterns = @(
        Get-Content -LiteralPath '.keel/protected-paths.txt' -Encoding utf8 |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and -not $_.StartsWith('#') }
    )

    $hits = @(
        @(
            foreach ($file in $changed) {
                foreach ($pattern in $patterns) {
                    $matched = if ($pattern.EndsWith('/')) { $file.StartsWith($pattern) } else { $file -eq $pattern }
                    if ($matched) { $file; break }
                }
            }
        ) | Sort-Object
    )

    $baseLabel = if ($Base) { $Base } else { '暂存区' }
    if ($hits.Count -gt 0) {
        Write-Host "以下受保护文件相对 $baseLabel 有改动，需要人审核：" -ForegroundColor Yellow
        foreach ($hit in $hits) { Write-Host "  $hit" }
        if ($Strict) { exit 1 }
    }
    else {
        Write-Host "没有受保护文件改动（基线：$baseLabel）。"
    }
    exit 0
}
finally {
    Pop-Location
}
