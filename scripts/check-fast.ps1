# 快速检查：格式、lint、类型、架构规则、测试。由 keel 管理，不要手改；项目自己的步骤写在 check.local.ps1。
[CmdletBinding()]
param([switch]$ListOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $root '.keel/lib.ps1')
$steps = Get-KeelSteps -Mode fast -Root $root
Invoke-KeelSteps -Steps $steps -Root $root -ListOnly:$ListOnly -Title '快速检查'
