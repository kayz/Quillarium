# Quillarium 自己的检查步骤。本文件归项目所有，keel 更新时不会覆盖。
# keel 的 ts-pnpm 包已经覆盖：格式、lint、构建、架构规则（pnpm arch）、测试。
# 这里补上验收测试的类型检查，以及 CI 里的覆盖率、桌面端构建和依赖审计。

function Get-KeelLocalSteps {
    param(
        [Parameter(Mandatory)][ValidateSet('fast', 'full')][string]$Mode,
        [Parameter(Mandatory)][string]$Root
    )
    $steps = [System.Collections.Generic.List[object]]::new()

    $steps.Add((New-KeelStep -Name '验收测试类型检查' -Command 'pnpm' -Arguments @('exec', 'tsc', '-p', 'tests')))

    if ($Mode -eq 'full') {
        $steps.Add((New-KeelStep -Name '覆盖率' -Command 'pnpm' -Arguments @('run', 'test:coverage')))
        $steps.Add((New-KeelStep -Name '桌面端构建' -Command 'pnpm' -Arguments @('run', 'desktop:build')))
        $steps.Add((New-KeelStep -Name '生产依赖审计' -Command 'pnpm' -Arguments @('audit', '--prod', '--audit-level=high')))
    }

    return $steps.ToArray()
}
