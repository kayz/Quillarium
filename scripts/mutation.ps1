# 变异测试：故意改坏代码，检查测试能否发现。较慢，只针对核心模块按需运行。由 keel 管理，不要手改。
[CmdletBinding()]
param([switch]$ListOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $root '.keel/lib.ps1')
$steps = Get-KeelSteps -Mode mutation -Root $root
Invoke-KeelSteps -Steps $steps -Root $root -ListOnly:$ListOnly -Title '变异测试'
