import type { ForeshadowingDoc, ForeshadowingTriggerCondition } from './types.js'

export interface ForeshadowingReminderContext {
  outline_ids: Iterable<string>
  timeline_ids: Iterable<string>
  enabled_card_ids: Iterable<string>
  text: string
}

export interface ForeshadowingReminder {
  card_id: string
  title: string
  reminder_window: string
  matched_conditions: ForeshadowingTriggerCondition[]
}

/** Evaluate author reminders without mutating the foreshadowing ledger. */
export function evaluateForeshadowingReminders(
  cards: ForeshadowingDoc[],
  context: ForeshadowingReminderContext
): ForeshadowingReminder[] {
  const outlineIds = new Set(context.outline_ids)
  const timelineIds = new Set(context.timeline_ids)
  const enabledCardIds = new Set(context.enabled_card_ids)
  const text = context.text.toLocaleLowerCase()

  return cards
    .filter((card) => card.enabled !== false && card.state !== 'resolved' && card.state !== 'abandoned')
    .map((card) => {
      const matched_conditions = card.trigger_conditions.filter((condition) => {
        switch (condition.kind) {
          case 'timeline_reached':
            return Boolean(condition.target_id) && timelineIds.has(condition.target_id)
          case 'outline_reached':
            return Boolean(condition.target_id) && outlineIds.has(condition.target_id)
          case 'card_enabled':
            return Boolean(condition.target_id) && enabledCardIds.has(condition.target_id)
          case 'keyword':
            return (
              Boolean(condition.keyword.trim()) && text.includes(condition.keyword.trim().toLocaleLowerCase())
            )
        }
      })
      return {
        card_id: card.id,
        title: card.title,
        reminder_window: card.reminder_window,
        matched_conditions
      }
    })
    .filter((reminder) => reminder.matched_conditions.length > 0)
}
