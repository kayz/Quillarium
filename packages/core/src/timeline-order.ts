/** An event enters formal order only when it has a character, a time, and a place. */
export function timelineEventIsComplete(event: {
  characters?: readonly string[]
  location?: string | null
  timeline_node?: string | null
  date?: string
  placements?: readonly { start_node_id?: string }[]
}): boolean {
  const hasCharacter = (event.characters ?? []).some((id) => id.trim().length > 0)
  const hasPlace = Boolean(event.location?.trim())
  const hasTime =
    Boolean(event.timeline_node?.trim()) ||
    Boolean(event.date?.trim()) ||
    (event.placements ?? []).some((placement) => Boolean(placement.start_node_id?.trim()))
  return hasCharacter && hasPlace && hasTime
}
