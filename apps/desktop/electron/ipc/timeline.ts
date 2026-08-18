import {
  applyLegacyTimelineMigration,
  applyStoryTimeTimelineImport,
  checkTimelineDeterministically,
  createTimeSystem,
  createTimelineNodeV2,
  createTimelineTrack,
  deleteTimeSystem,
  deleteTimelineTrack,
  getTimelineOrderSnapshot,
  listDocs,
  listTimelineCatalog,
  placeTimelineEvent,
  planLegacyTimelineMigration,
  planStoryTimeTimelineImport,
  reorderTimelineEvents,
  reorderTimelineNodes,
  reorderTimelineTracks,
  updateTimeSystem,
  updateTimelineTrack,
  type CharacterDoc,
  type TimelineEventDoc,
  type TimelineNodeDoc
} from '@quillarium/core'
import { typedHandle } from './contract.js'

export function registerTimelineHandlers(): void {
  typedHandle('timeline:catalog', async (_event, root) => listTimelineCatalog(root))
  typedHandle('timeline:orderSnapshot', async (_event, root, trackId) =>
    getTimelineOrderSnapshot(root, trackId)
  )
  typedHandle('timeline:reorderTracks', async (_event, root, orderedTrackIds, expectedHashes) =>
    reorderTimelineTracks(root, orderedTrackIds, expectedHashes)
  )
  typedHandle('timeline:reorderNodes', async (_event, root, input) => reorderTimelineNodes(root, input))
  typedHandle('timeline:reorderEvents', async (_event, root, input) => reorderTimelineEvents(root, input))
  typedHandle('timeline:placeEvent', async (_event, root, input) => placeTimelineEvent(root, input))
  typedHandle('timeline:createNode', async (_event, root, input) => createTimelineNodeV2(root, input))
  typedHandle('timeline:createTimeSystem', async (_event, root, value) => createTimeSystem(root, value))
  typedHandle('timeline:updateTimeSystem', async (_event, root, value, expectedHash) =>
    updateTimeSystem(root, value, expectedHash)
  )
  typedHandle('timeline:deleteTimeSystem', async (_event, root, id, expectedHash) => {
    await deleteTimeSystem(root, id, expectedHash)
    return true
  })
  typedHandle('timeline:createTrack', async (_event, root, value) => createTimelineTrack(root, value))
  typedHandle('timeline:updateTrack', async (_event, root, value, expectedHash) =>
    updateTimelineTrack(root, value, expectedHash)
  )
  typedHandle('timeline:deleteTrack', async (_event, root, id, expectedHash) => {
    await deleteTimelineTrack(root, id, expectedHash)
    return true
  })
  typedHandle('timeline:migrationPlan', async (_event, root) => planLegacyTimelineMigration(root))
  typedHandle('timeline:migrationApply', async (_event, root, plan) =>
    applyLegacyTimelineMigration(root, plan)
  )
  typedHandle('timeline:storyTimePlan', async (_event, root) => planStoryTimeTimelineImport(root))
  typedHandle('timeline:storyTimeApply', async (_event, root, plan, decision) =>
    applyStoryTimeTimelineImport(root, plan, decision)
  )
  typedHandle('timeline:check', async (_event, root) => {
    const [catalog, nodes, events, characters] = await Promise.all([
      listTimelineCatalog(root),
      listDocs<TimelineNodeDoc>(root, 'timeline_node'),
      listDocs<TimelineEventDoc>(root, 'timeline_event'),
      listDocs<CharacterDoc>(root, 'character')
    ])
    return checkTimelineDeterministically({
      tracks: catalog.tracks.map((track) => track.value),
      nodes: nodes.map((item) => item.data),
      events: events.map((item) => item.data),
      characters: characters.map((item) => item.data)
    })
  })
}
