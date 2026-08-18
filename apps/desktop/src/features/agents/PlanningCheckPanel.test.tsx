import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlanningCheckPanel, type PlanningCheckPanelOutcome } from './PlanningCheckPanel.js'

describe('PlanningCheckPanel', () => {
  it('keeps a provider failure inside a localized task panel with retry and Run inspection', () => {
    const outcome: PlanningCheckPanelOutcome = {
      status: 'failed',
      execution_id: 'agent-ui-failure',
      task_id: 'planning-integrity-review',
      run_path: 'runs/agents/agent-ui-failure',
      error: {
        schema_version: 1,
        code: 'AGENT_PROVIDER_TIMEOUT',
        phase: 'provider',
        task_id: 'planning-integrity-review',
        execution_id: 'agent-ui-failure',
        retry_safe: true,
        message_key: 'agent.error.agent_provider_timeout',
        technical_detail: 'AIRequestError: upstream request timed out',
        validation_paths: [],
        artifacts: {}
      }
    }

    const html = renderToStaticMarkup(
      <PlanningCheckPanel
        outcome={outcome}
        language="zh"
        busy={false}
        onClose={() => undefined}
        onRetry={async () => undefined}
        onApply={async () => ({
          status: 'applied',
          result: {
            schema_version: 1,
            decision_id: 'approval-unused',
            execution_id: outcome.execution_id,
            created_issue_ids: [],
            updated_issue_ids: [],
            applied_at: '2026-08-17T00:00:00.000Z'
          }
        })}
        onInspect={async () => undefined}
      />
    )

    expect(html).toContain('class="agent-task-panel"')
    expect(html).toContain('模型请求超时')
    expect(html).toContain('AIRequestError: upstream request timed out')
    expect(html).toContain('agent-ui-failure')
    expect(html).toContain('重试任务')
    expect(html).toContain('检查 Run')
    expect(html).toContain('写作工作区和作品文件均未被清空')
  })

  it('shows partial batch evidence without treating proposals as already applied', () => {
    const outcome: PlanningCheckPanelOutcome = {
      status: 'completed',
      execution_id: 'agent-ui-partial',
      task_id: 'planning-integrity-review',
      run_path: 'runs/agents/agent-ui-partial',
      result: {
        schema_version: 1,
        generated_at: '2026-08-17T00:00:00.000Z',
        scope: 'project',
        checked_cards: 2,
        skipped_disabled: 0,
        deterministic_findings: [],
        semantic_proposals: [
          {
            schema_version: 1,
            id: 'proposal-one',
            fingerprint: 'a'.repeat(64),
            code: 'ai-planning-foreshadowing',
            severity: 'warning',
            title: '边界待确认',
            message: '规则缺少适用时段。',
            evidence: '资料只描述了白天。',
            related_ids: ['foreshadow-one'],
            source: 'ai',
            child_execution_id: 'agent-ui-partial-batch-1'
          }
        ],
        batches: [
          {
            key: 'batch-001',
            child_execution_id: 'agent-ui-partial-batch-1',
            document_ids: ['foreshadow-one'],
            status: 'completed',
            finding_count: 1
          },
          {
            key: 'batch-002',
            child_execution_id: 'agent-ui-partial-batch-2',
            document_ids: ['foreshadow-two'],
            status: 'failed',
            finding_count: 0,
            error: {
              schema_version: 1,
              code: 'AGENT_REPAIR_FAILED',
              phase: 'repair',
              task_id: 'planning-integrity-review',
              execution_id: 'agent-ui-partial-batch-2',
              retry_safe: true,
              message_key: 'agent.error.agent_repair_failed',
              technical_detail: 'category: Invalid enum value; title: Required',
              validation_paths: ['issues.0.category: Invalid enum value', 'issues.0.title: Required'],
              artifacts: {}
            }
          }
        ],
        semantic_status: 'partial',
        warnings: []
      }
    }

    const html = renderToStaticMarkup(
      <PlanningCheckPanel
        outcome={outcome}
        language="zh"
        busy={false}
        onClose={() => undefined}
        onRetry={async () => undefined}
        onApply={async () => ({
          status: 'applied',
          result: {
            schema_version: 1,
            decision_id: 'approval-unused',
            execution_id: outcome.execution_id,
            created_issue_ids: [],
            updated_issue_ids: [],
            applied_at: '2026-08-17T00:00:00.000Z'
          }
        })}
        onInspect={async () => undefined}
      />
    )

    expect(html).toContain('失败批次')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('模型输出未通过格式校验')
    expect(html).toContain('失败批次的内容没有作为问题提案采纳')
    expect(html).toContain('agent-ui-partial-batch-2')
    expect(html).toContain('issues.0.category: Invalid enum value')
    expect(html).toContain('category: Invalid enum value; title: Required')
    expect(html).toContain('只重试失败批次')
    expect(html).toContain('资料只描述了白天')
    expect(html).toContain('确认写入所选问题（0）')
    expect(html).not.toContain('已创建')
  })
})
