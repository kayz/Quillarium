# keel 技术栈包：TypeScript + pnpm workspace。由 keel 管理，不要手改。
# 按根目录 package.json 里实际存在的脚本组装检查步骤，项目不必改名迁就骨架。

function Get-KeelStackSteps {
    param(
        [Parameter(Mandatory)][ValidateSet('fast', 'full', 'mutation')][string]$Mode,
        [Parameter(Mandatory)][string]$Root
    )
    $packagePath = Join-Path $Root 'package.json'
    if (-not (Test-Path -LiteralPath $packagePath)) {
        throw 'ts-pnpm：根目录没有 package.json。'
    }
    $package = Get-Content -LiteralPath $packagePath -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
    $scripts = if ($package.ContainsKey('scripts') -and $package['scripts']) { $package['scripts'] } else { @{} }
    $steps = [System.Collections.Generic.List[object]]::new()

    if (-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules'))) {
        $installArgs = if (Test-Path -LiteralPath (Join-Path $Root 'pnpm-lock.yaml')) { @('install', '--frozen-lockfile') } else { @('install') }
        $steps.Add((New-KeelStep -Name '安装依赖' -Command 'pnpm' -Arguments $installArgs))
    }

    if ($Mode -eq 'mutation') {
        if (-not (Test-Path -LiteralPath (Join-Path $Root 'stryker.config.json'))) {
            throw 'ts-pnpm：没有 stryker.config.json，无法运行变异测试。'
        }
        $steps.Add((New-KeelStep -Name '变异测试' -Command 'pnpm' -Arguments @('exec', 'stryker', 'run')))
        return $steps.ToArray()
    }

    if ($scripts.ContainsKey('format:check')) {
        $steps.Add((New-KeelStep -Name '格式' -Command 'pnpm' -Arguments @('run', 'format:check')))
    }
    if ($scripts.ContainsKey('lint')) {
        $steps.Add((New-KeelStep -Name 'lint' -Command 'pnpm' -Arguments @('run', 'lint')))
    }
    if ($Mode -eq 'full' -and $scripts.ContainsKey('build')) {
        $steps.Add((New-KeelStep -Name '构建' -Command 'pnpm' -Arguments @('run', 'build')))
    }
    if ($scripts.ContainsKey('typecheck')) {
        $steps.Add((New-KeelStep -Name '类型检查' -Command 'pnpm' -Arguments @('run', 'typecheck')))
    }
    elseif ($Mode -eq 'fast' -and $scripts.ContainsKey('build')) {
        $steps.Add((New-KeelStep -Name '构建（含类型检查）' -Command 'pnpm' -Arguments @('run', 'build')))
    }

    if ($scripts.ContainsKey('arch')) {
        $steps.Add((New-KeelStep -Name '架构规则' -Command 'pnpm' -Arguments @('run', 'arch')))
    }
    elseif (Test-Path -LiteralPath (Join-Path $Root '.dependency-cruiser.cjs')) {
        $targets = @('packages', 'apps', 'src') | Where-Object { Test-Path -LiteralPath (Join-Path $Root $_) }
        if ($targets) {
            $arguments = @('exec', 'depcruise', '--config', '.dependency-cruiser.cjs')
            if (Test-Path -LiteralPath (Join-Path $Root '.dependency-cruiser-known-violations.json')) {
                $arguments += @('--ignore-known', '.dependency-cruiser-known-violations.json')
            }
            $arguments += @($targets)
            $steps.Add((New-KeelStep -Name '架构规则' -Command 'pnpm' -Arguments $arguments))
        }
    }

    if ($scripts.ContainsKey('test')) {
        $steps.Add((New-KeelStep -Name '测试' -Command 'pnpm' -Arguments @('run', 'test')))
    }
    if ($Mode -eq 'full' -and $scripts.ContainsKey('test:e2e')) {
        $steps.Add((New-KeelStep -Name '端到端测试' -Command 'pnpm' -Arguments @('run', 'test:e2e')))
    }

    return $steps.ToArray()
}
