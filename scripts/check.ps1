# 完整检查：在快速检查之外加上构建、端到端测试和项目自己的完整步骤。由 keel 管理，不要手改。
[CmdletBinding()]
param([switch]$ListOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $root '.keel/lib.ps1')
$steps = Get-KeelSteps -Mode full -Root $root
Invoke-KeelSteps -Steps $steps -Root $root -ListOnly:$ListOnly -Title '完整检查'
