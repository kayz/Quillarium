import type { LanguageName, TargetSelection } from '../../app/types.js'
import type { TimelineBoardModel } from './timeline-board-model.js'

const LABEL_WIDTH = 78
const STATION_WIDTH = 148
const STATION_GAP = 40
const HEADER_HEIGHT = 28
const TRACK_HEIGHT = 88
const STATION_TOP = HEADER_HEIGHT + 8
const STATION_HEAD = 18
const EVENT_HEIGHT = 34
const EVENT_GAP = 6
const STATION_PAD = 8

export function TimelineRailBoard({
  model,
  selectedTarget,
  onSelect,
  language
}: {
  model: TimelineBoardModel
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  language: LanguageName
}) {
  const zh = language === 'zh'
  if (!model.stations.length || !model.tracks.length) return null
  const width = Math.max(480, LABEL_WIDTH + model.stations.length * (STATION_WIDTH + STATION_GAP) + 24)
  const height = Math.max(
    HEADER_HEIGHT + model.tracks.length * TRACK_HEIGHT + 16,
    STATION_TOP +
      Math.max(...model.stations.map((station) => stationHeight(station.pointEvents.length)), TRACK_HEIGHT) +
      12
  )
  const stationX = (index: number) => LABEL_WIDTH + index * (STATION_WIDTH + STATION_GAP)
  const homeY = (trackIndex: number) => HEADER_HEIGHT + trackIndex * TRACK_HEIGHT + TRACK_HEIGHT * 0.42
  const eventCenterY = (index: number) =>
    STATION_TOP + STATION_HEAD + index * (EVENT_HEIGHT + EVENT_GAP) + EVENT_HEIGHT / 2

  return (
    <div className="timeline-rail-board" aria-label={zh ? '时间线画板' : 'Timeline board'}>
      <div className="timeline-rail-board-inner" style={{ width, height }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
          {model.stations.map((station, index) => (
            <text
              key={`tick-${station.nodeId}`}
              x={stationX(index) + STATION_WIDTH / 2}
              y={18}
              textAnchor="middle"
              className="timeline-rail-tick"
            >
              {station.label}
            </text>
          ))}
          {model.tracks.map((track, trackIndex) => (
            <text
              key={`label-${track.id}`}
              x={8}
              y={homeY(trackIndex) + 4}
              className={`timeline-rail-label token-${track.colorToken}`}
            >
              {track.title}
            </text>
          ))}
          {model.overlays.map((overlay) =>
            overlay.bands.map((band, bandIndex) => (
              <rect
                key={`${overlay.eventId}-${bandIndex}`}
                className="timeline-rail-overlay"
                x={stationX(overlay.startStationIndex)}
                y={HEADER_HEIGHT + band.startTrackIndex * TRACK_HEIGHT}
                width={
                  stationX(overlay.endStationIndex) + STATION_WIDTH - stationX(overlay.startStationIndex)
                }
                height={(band.endTrackIndex - band.startTrackIndex + 1) * TRACK_HEIGHT}
                rx={14}
              />
            ))
          )}
          {model.tracks.map((track, trackIndex) => (
            <path
              key={`rail-${track.id}`}
              className={`timeline-rail-line token-${track.colorToken}`}
              d={railPath(model, trackIndex, track.id, stationX, homeY, eventCenterY)}
              fill="none"
            />
          ))}
          {model.overlays.flatMap((overlay) => {
            const x = stationX(overlay.startStationIndex)
            const overlayWidth = stationX(overlay.endStationIndex) + STATION_WIDTH - x
            return overlay.bands.map((band, bandIndex) => {
              const y = HEADER_HEIGHT + band.startTrackIndex * TRACK_HEIGHT
              const overlayHeight = (band.endTrackIndex - band.startTrackIndex + 1) * TRACK_HEIGHT
              return (
                <g key={`overlay-label-${overlay.eventId}-${bandIndex}`}>
                  <rect
                    className="timeline-rail-overlay-label-bg"
                    x={x + overlayWidth - 148}
                    y={y + overlayHeight / 2 - 12}
                    width={132}
                    height={24}
                    rx={8}
                  />
                  <text
                    className="timeline-rail-overlay-label"
                    x={x + overlayWidth - 82}
                    y={y + overlayHeight / 2 + 5}
                    textAnchor="middle"
                  >
                    {overlay.title}
                  </text>
                </g>
              )
            })
          })}
        </svg>
        {model.stations.map((station, index) =>
          station.pointEvents.length ? (
            <div
              key={station.nodeId}
              className="timeline-rail-station"
              style={{
                left: stationX(index),
                top: STATION_TOP,
                width: STATION_WIDTH
              }}
            >
              <button
                type="button"
                className={`timeline-rail-station-head ${selectedTarget?.id === station.nodeId ? 'active' : ''}`}
                onClick={() => onSelect({ type: 'timeline_node', id: station.nodeId })}
              >
                {zh ? '站 · 上早下晚' : 'Station · earlier on top'}
              </button>
              {station.pointEvents.map((event, eventIndex) => (
                <button
                  type="button"
                  key={event.eventId}
                  className={`timeline-rail-event ${event.junction ? 'junction' : ''} ${selectedTarget?.id === event.eventId ? 'active' : ''}`}
                  onClick={() => onSelect({ type: 'timeline_event', id: event.eventId })}
                >
                  <span>
                    {eventIndex + 1} {event.title}
                  </span>
                  {event.junction ? (
                    <small>{event.trackIds.map((id) => trackTitle(model, id)).join(' ∩ ')}</small>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null
        )}
        {model.overlays.flatMap((overlay) =>
          overlay.bands.map((band, bandIndex) => (
            <button
              type="button"
              key={`hit-${overlay.eventId}-${bandIndex}`}
              className={`timeline-rail-overlay-hit ${selectedTarget?.id === overlay.eventId ? 'active' : ''}`}
              style={{
                left: stationX(overlay.startStationIndex),
                top: HEADER_HEIGHT + band.startTrackIndex * TRACK_HEIGHT,
                width:
                  stationX(overlay.endStationIndex) + STATION_WIDTH - stationX(overlay.startStationIndex),
                height: (band.endTrackIndex - band.startTrackIndex + 1) * TRACK_HEIGHT
              }}
              aria-label={overlay.title}
              onClick={() => onSelect({ type: 'timeline_event', id: overlay.eventId })}
            />
          ))
        )}
      </div>
    </div>
  )
}

function stationHeight(eventCount: number): number {
  if (!eventCount) return 0
  return STATION_HEAD + eventCount * (EVENT_HEIGHT + EVENT_GAP) + STATION_PAD
}

function trackTitle(model: TimelineBoardModel, trackId: string): string {
  return model.tracks.find((track) => track.id === trackId)?.title ?? trackId
}

function railPath(
  model: TimelineBoardModel,
  trackIndex: number,
  trackId: string,
  stationX: (index: number) => number,
  homeY: (index: number) => number,
  eventCenterY: (index: number) => number
): string {
  const yHome = homeY(trackIndex)
  const track = model.tracks[trackIndex]
  const parts = [`M ${LABEL_WIDTH - 6} ${yHome}`]
  model.stations.forEach((station, index) => {
    const x0 = stationX(index)
    const x1 = x0 + STATION_WIDTH
    const visits = station.pointEvents
      .map((event, eventIndex) => (event.trackIds.includes(trackId) ? eventIndex : -1))
      .filter((eventIndex) => eventIndex >= 0)
    const bypass = track?.stations[index] === 'bypass'
    const bottom = STATION_TOP + stationHeight(station.pointEvents.length)
    if (!visits.length) {
      const needsDetour = bypass && yHome >= STATION_TOP && yHome <= bottom && station.pointEvents.length > 0
      if (needsDetour) {
        parts.push(`H ${x0 - 8} V ${bottom + 8} H ${x1 + 8} V ${yHome}`)
      } else {
        parts.push(`H ${x1 + STATION_GAP / 2}`)
      }
      return
    }
    const firstY = eventCenterY(visits[0]!)
    const lastY = eventCenterY(visits[visits.length - 1]!)
    parts.push(`H ${x0 - 14} C ${x0 - 4} ${yHome} ${x0 - 4} ${firstY} ${x0} ${firstY}`)
    if (visits.length > 1) {
      parts.push(`M ${x1 - 8} ${firstY} V ${lastY} H ${x1}`)
    } else {
      parts.push(`H ${x1}`)
    }
    parts.push(`C ${x1 + 16} ${lastY} ${x1 + 22} ${yHome} ${x1 + STATION_GAP / 2} ${yHome}`)
  })
  return parts.join(' ')
}
