import { useMemo, useState } from 'react'
import { Copy, X } from 'lucide-react'
import type { AgentPromptEnvelopeV1, PromptBlock } from '@quillarium/core'
import { sanitizeSensitiveText, sanitizeSensitiveValue } from '@quillarium/core/sensitive-data'
import type { LanguageName } from '../../app/types.js'

export interface PromptViewerData {
  promptEnvelope: AgentPromptEnvelopeV1
  providerRequest: Record<string, unknown>
  promptBlocks: PromptBlock[]
  providerTransformed: boolean
}

export function createLegacyPromptViewerData(prompt: string, presetRaw: string): PromptViewerData {
  const preset = JSON.parse(presetRaw) as {
    prompt_stack?: { system_prompt?: string }
  }
  const messages = [
    {
      role: 'system' as const,
      content: preset.prompt_stack?.system_prompt ?? 'Legacy generation system prompt was not snapshotted.'
    },
    { role: 'user' as const, content: prompt }
  ]
  return {
    promptEnvelope: { messages } as AgentPromptEnvelopeV1,
    providerRequest: { messages },
    promptBlocks: [],
    providerTransformed: false
  }
}

export function PromptEnvelopeViewer({
  data,
  language,
  title,
  onClose
}: {
  data: PromptViewerData
  language: LanguageName
  title?: string
  onClose: () => void
}) {
  const zh = language === 'zh'
  const [view, setView] = useState<'blocks' | 'text' | 'json'>('blocks')
  const [copied, setCopied] = useState('')
  const messages = useMemo(
    () => sanitizePromptMessages(data.promptEnvelope.messages),
    [data.promptEnvelope.messages]
  )
  const fullText = modelVisiblePromptText(messages)
  const sources = sanitizePromptText(promptSourceNotes(data.promptBlocks))
  const copy = async (kind: 'text' | 'json' | 'sources') => {
    const value =
      kind === 'json'
        ? JSON.stringify(messages, null, 2)
        : kind === 'sources'
          ? `${fullText}\n\n---\n${zh ? '来源说明' : 'Source notes'}\n${sources}`
          : fullText
    await navigator.clipboard.writeText(value)
    setCopied(kind)
  }
  return (
    <div className="modal-backdrop prompt-viewer-backdrop" role="presentation">
      <section className="modal prompt-envelope-viewer" role="dialog" aria-modal="true">
        <header className="prompt-viewer-head">
          <div>
            <span className="badge ok">PromptEnvelope</span>
            <h2>{title ?? (zh ? '完整提示词' : 'Full prompt')}</h2>
            <p>
              {zh
                ? '只读快照；修改提示词请返回头部提示词或原始来源后重新组装。'
                : 'Read-only snapshot. Edit the header or source material, then compile again.'}
            </p>
          </div>
          <button onClick={onClose} aria-label={zh ? '关闭完整提示词' : 'Close full prompt'}>
            <X size={17} />
          </button>
        </header>
        <div className={`provider-transform-note ${data.providerTransformed ? 'warn' : 'ok'}`}>
          {data.providerTransformed
            ? zh
              ? '提供商适配器改变了最终消息格式；下方同时保留 Quillarium PromptEnvelope 与脱敏 provider request。'
              : 'The provider adapter changed the final message format; both the PromptEnvelope and sanitized provider request are retained.'
            : zh
              ? '提供商消息与 PromptEnvelope 一致；provider request 已移除凭据和本机路径。'
              : 'Provider messages match the PromptEnvelope; credentials and local paths are removed from the saved request.'}
        </div>
        <nav className="prompt-viewer-tabs">
          <button className={view === 'blocks' ? 'active' : ''} onClick={() => setView('blocks')}>
            {zh ? '分块视图' : 'Blocks'}
          </button>
          <button className={view === 'text' ? 'active' : ''} onClick={() => setView('text')}>
            {zh ? '完整文本' : 'Full text'}
          </button>
          <button className={view === 'json' ? 'active' : ''} onClick={() => setView('json')}>
            {zh ? '消息 JSON' : 'Message JSON'}
          </button>
        </nav>
        <div className="prompt-viewer-body">
          {view === 'blocks' ? (
            <div className="prompt-block-table">
              {data.promptBlocks.length ? (
                data.promptBlocks.map((block, index) => (
                  <article key={block.id}>
                    <span className="prompt-block-order">{index + 1}</span>
                    <div>
                      <strong>{sanitizePromptText(block.title)}</strong>
                      <small>
                        {block.role} · {block.source.type}:{sanitizePromptText(block.source.id)} ·{' '}
                        {block.authority}
                      </small>
                      <small>
                        {block.token_count.toLocaleString()} token
                        {block.truncated ? (zh ? ' · 已截断' : ' · truncated') : ''} ·{' '}
                        {sanitizePromptText(block.selection_reason)}
                      </small>
                    </div>
                  </article>
                ))
              ) : (
                <p>
                  {zh
                    ? '此旧 Run 没有保存 PromptBlock 快照。'
                    : 'This legacy run has no PromptBlock snapshot.'}
                </p>
              )}
            </div>
          ) : view === 'text' ? (
            <pre className="prompt-viewer-text">{fullText}</pre>
          ) : (
            <>
              <pre className="prompt-viewer-text">{JSON.stringify(messages, null, 2)}</pre>
              <details>
                <summary>{zh ? '脱敏后的 provider-request.json' : 'Sanitized provider-request.json'}</summary>
                <pre className="prompt-viewer-text">
                  {JSON.stringify(sanitizePromptValue(data.providerRequest), null, 2)}
                </pre>
              </details>
            </>
          )}
        </div>
        <footer className="prompt-viewer-actions">
          <span>{copied ? (zh ? '已复制' : 'Copied') : ''}</span>
          <button onClick={() => void copy('text')}>
            <Copy size={14} /> {zh ? '复制完整提示词' : 'Copy full prompt'}
          </button>
          <button onClick={() => void copy('json')}>
            <Copy size={14} /> {zh ? '复制消息 JSON' : 'Copy message JSON'}
          </button>
          <button onClick={() => void copy('sources')}>
            <Copy size={14} /> {zh ? '复制并附带来源说明' : 'Copy with source notes'}
          </button>
        </footer>
      </section>
    </div>
  )
}

export function modelVisiblePromptText(messages: Array<{ content: string }>): string {
  return messages.map((message) => message.content).join('\n\n')
}

export function sanitizePromptMessages<T extends { role: string; content: string }>(messages: T[]): T[] {
  return messages.map((message) => ({
    ...message,
    content: sanitizePromptText(message.content)
  }))
}

export function sanitizePromptValue(value: unknown): unknown {
  return sanitizeSensitiveValue(value)
}

export function sanitizePromptText(value: string): string {
  return sanitizeSensitiveText(value)
}

function promptSourceNotes(blocks: PromptBlock[]): string {
  return blocks
    .map(
      (block, index) =>
        `${index + 1}. ${block.title} — ${block.source.type}:${block.source.id}; ${block.authority}; ${block.token_count} token; ${block.selection_reason}`
    )
    .join('\n')
}
