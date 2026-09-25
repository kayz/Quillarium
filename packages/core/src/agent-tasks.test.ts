import { describe, expect, it } from 'vitest'
import { getAgentTaskDefinition, listAgentTaskDefinitions } from './agent-tasks.js'

describe('agent task lanes', () => {
  it('labels every builtin task and keeps expert tasks from generating prose', () => {
    const lanes: Record<string, string> = Object.fromEntries(
      listAgentTaskDefinitions().map((task) => [task.id, task.lane])
    )
    expect(lanes).toMatchObject({
      'import-material': 'expert',
      'planning-card': 'expert',
      'organize-setting': 'expert',
      'organize-outline': 'expert',
      'organize-worldbook': 'expert',
      'analyze-relations': 'expert',
      'manage-foreshadowing': 'expert',
      'continuity-review': 'expert',
      'continuity-check': 'expert',
      'finalization-review': 'expert',
      'character-rehearsal': 'expert',
      'scene-generation': 'generation',
      'setting-card-design': 'display',
      'display-card-design': 'display'
    })
    for (const task of listAgentTaskDefinitions()) {
      if (task.lane === 'expert') expect(task.capability_ceiling).not.toContain('generate_candidate')
    }
    expect(getAgentTaskDefinition('character-rehearsal').allowed_result_types).not.toContain('candidate')
    expect(getAgentTaskDefinition('continuity-check')).toMatchObject({
      capability_ceiling: expect.arrayContaining(['propose_issue', 'propose_planning_record']),
      allowed_result_types: expect.arrayContaining(['issue_proposal', 'planning_proposal'])
    })
    expect(getAgentTaskDefinition('organize-outline')).toMatchObject({
      lane: 'expert',
      capability_ceiling: expect.not.arrayContaining(['generate_candidate']),
      allowed_result_types: expect.arrayContaining(['planning_proposal'])
    })
    expect(getAgentTaskDefinition('organize-worldbook')).toMatchObject({
      lane: 'expert',
      capability_ceiling: expect.not.arrayContaining(['generate_candidate']),
      allowed_result_types: expect.arrayContaining(['planning_proposal'])
    })
    expect(getAgentTaskDefinition('analyze-relations')).toMatchObject({
      lane: 'expert',
      title: '分析关系',
      capability_ceiling: expect.not.arrayContaining(['generate_candidate']),
      allowed_result_types: expect.arrayContaining(['planning_proposal'])
    })
    expect(getAgentTaskDefinition('manage-foreshadowing')).toMatchObject({
      lane: 'expert',
      title: '管理伏笔',
      capability_ceiling: expect.not.arrayContaining(['generate_candidate']),
      allowed_result_types: expect.arrayContaining(['planning_proposal'])
    })
  })
})
