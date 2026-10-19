# keel 检查脚本的公共函数。由 keel 管理，不要手改。
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-KeelStep {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Command,
        [string[]]$Arguments = @()
    )
    [pscustomobject]@{ Name = $Name; Command = $Command; Arguments = $Arguments }
}

function Get-KeelSettings {
    param([Parameter(Mandatory)][string]$Root)
    $path = Join-Path $Root '.keel/settings.json'
    Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
}

function Get-KeelSteps {
    param(
        [Parameter(Mandatory)][ValidateSet('fast', 'full', 'mutation')][string]$Mode,
        [Parameter(Mandatory)][string]$Root
    )
    $steps = [System.Collections.Generic.List[object]]::new()

    if ($Mode -ne 'mutation') {
        $guard = Join-Path $Root '.keel/protected-changes.ps1'
        $steps.Add((New-KeelStep -Name '受保护文件改动' -Command 'pwsh' -Arguments @('-NoProfile', '-NonInteractive', '-File', $guard)))
    }

    $settings = Get-KeelSettings -Root $Root
    foreach ($stack in @($settings.stacks)) {
        $stackFile = Join-Path $Root ".keel/stacks/$stack.ps1"
        if (-not (Test-Path -LiteralPath $stackFile)) {
            throw "找不到技术栈包脚本：$stackFile"
        }
        . $stackFile
        foreach ($step in @(Get-KeelStackSteps -Mode $Mode -Root $Root)) {
            if ($null -ne $step) { $steps.Add($step) }
        }
    }

    if ($Mode -ne 'mutation') {
        $localFile = Join-Path $Root 'scripts/check.local.ps1'
        if (Test-Path -LiteralPath $localFile) {
            . $localFile
            if (Get-Command -Name Get-KeelLocalSteps -CommandType Function -ErrorAction SilentlyContinue) {
                foreach ($step in @(Get-KeelLocalSteps -Mode $Mode -Root $Root)) {
                    if ($null -ne $step) { $steps.Add($step) }
                }
            }
        }
    }

    return , $steps.ToArray()
}

function Invoke-KeelSteps {
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Steps,
        [Parameter(Mandatory)][string]$Root,
        [switch]$ListOnly,
        [string]$Title = 'keel'
    )
    if ($Steps.Count -eq 0) {
        Write-Host "${Title}：没有需要运行的检查。"
        return
    }

    $index = 0
    foreach ($step in $Steps) {
        $index++
        $display = (@($step.Command) + @($step.Arguments)) -join ' '
        Write-Host ('[{0}/{1}] {2}: {3}' -f $index, $Steps.Count, $step.Name, $display)
        if ($ListOnly) { continue }

        $argv = @($step.Arguments)
        Push-Location -LiteralPath $Root
        try {
            & $step.Command @argv
            $code = $LASTEXITCODE
        }
        catch {
            Write-Host "无法运行：$($step.Name)。$($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
        finally {
            Pop-Location
        }

        if ($code -ne 0) {
            Write-Host "失败：$($step.Name)（退出码 $code）" -ForegroundColor Red
            exit $code
        }
    }

    if (-not $ListOnly) {
        Write-Host "${Title}：全部 $($Steps.Count) 项通过。" -ForegroundColor Green
    }
}
