import { generateCanonText } from '@quillarium/ai'
import { loadDesktopAIProfile } from './credentials.js'
import { typedHandle } from './contract.js'

export function registerCanonHandlers(): void {
  typedHandle('canon:discuss', async (_event, _root, input) => {
    const config = await loadDesktopAIProfile('background')
    const mode = input.mode === 'summarize' ? 'summarize' : 'discuss'
    const content = limitText(input.content ?? '', 12000)
    const transcript = limitText(input.transcript ?? '', mode === 'summarize' ? 24000 : 16000)
    const prompt = [
      `Mode: ${mode}`,
      `Canon title: ${input.title ?? ''}`,
      `Current status: ${input.status ?? 'draft'}`,
      `Current strength: ${input.strength ?? 'hard'}`,
      `Current source: ${input.source ?? 'user'}`,
      '',
      'Current canon body:',
      content.text,
      content.truncated ? '\n[Older canon body was omitted because it exceeded the safe request size.]' : '',
      '',
      'Discussion transcript:',
      transcript.text,
      transcript.truncated
        ? '\n[Earlier discussion was omitted. Continue from the visible recent context and the writer message.]'
        : '',
      '',
      mode === 'summarize'
        ? [
            'Please summarize the discussion into a canon entry.',
            'Return exactly this structure:',
            '## Canon',
            '<the concise content that should be saved as canon>',
            '',
            '## Metadata',
            'status: draft | confirmed | deprecated',
            'strength: hard | soft',
            'source: user | ai | imported | historical'
          ].join('\n')
        : [
            'Writer message:',
            input.message ?? '',
            '',
            'Reply as a careful canon discussion partner. Ask focused questions if the canon is still ambiguous; otherwise propose concrete rules.'
          ].join('\n')
    ].join('\n')
    return generateCanonText(prompt, config)
  })
}

function limitText(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false }
  return { text: value.slice(value.length - maxChars), truncated: true }
}
