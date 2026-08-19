import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const desktopCredentials = vi.hoisted(() => ({
  loadDesktopAIProfile: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:\\temp') },
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  ipcMain: { handle: vi.fn() },
  dialog: { showSaveDialog: vi.fn() }
}))
vi.mock('./credentials.js', () => desktopCredentials)
vi.mock('./setting-assets.js', () => ({ loadSettingImage: vi.fn(async () => null) }))

import type { AgentProvider } from '@quillarium/agent-runtime'
import { createCharacter, createProjectAt, defaultSettingCardTemplate, pathExists } from '@quillarium/core'
import { designSettingCard, exportSettingCard, renderSettingCard } from './setting-cards.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  vi.clearAllMocks()
})

describe('setting-card desktop Agent wiring', () => {
  it('uses the desktop credential loader for the encrypted background profile', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-setting-card-ipc-'))
    roots.push(root)
    await createProjectAt(root, { id: 'setting-card-ipc', title: 'Setting card IPC' })
    await createCharacter(root, '于谦', { id: 'char-yu-qian' }, 'A principled minister.')
    desktopCredentials.loadDesktopAIProfile.mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.example.invalid/v1',
      apiKey: 'desktop-decrypted-test-key',
      model: 'test-model',
      temperature: 0.4,
      maxTokens: 4_000,
      contextWindowTokens: 16_000
    })
    const provider = vi.fn<AgentProvider>(async (request) => {
      expect(request.config.apiKey).toBe('desktop-decrypted-test-key')
      return JSON.stringify({
        template_html:
          '<article class="setting-card">{{image}}<h1>{{title}}</h1><div>{{content}}</div></article>',
        css: '.setting-card{box-sizing:border-box;color:#211d18;background:#f3ecde}',
        notes: 'Desktop profile loaded.'
      })
    })

    const result = await designSettingCard(
      root,
      {
        document_id: 'char-yu-qian',
        document_type: 'character',
        style_direction: 'ink-archive',
        size: { width: 720, height: 1080 },
        base_style: null,
        language: 'zh'
      },
      { invokeProvider: provider }
    )

    expect(desktopCredentials.loadDesktopAIProfile).toHaveBeenCalledTimes(1)
    expect(desktopCredentials.loadDesktopAIProfile).toHaveBeenCalledWith('background')
    expect(provider).toHaveBeenCalledTimes(1)
    expect(result.html).toContain('于谦')
    expect(result.candidate.template.notes).toBe('Desktop profile loaded.')
    expect(result.run_relative_path).toMatch(/^runs\/agents\/agent-/u)
    expect(result.run_relative_path).not.toContain('..')
  })

  it('uses the bounded structured-output repair when a Roll omits a required placeholder', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-setting-card-repair-'))
    roots.push(root)
    await createProjectAt(root, { id: 'setting-card-repair', title: 'Setting card repair' })
    await createCharacter(root, '于谦', { id: 'char-yu-qian' }, 'A principled minister.')
    desktopCredentials.loadDesktopAIProfile.mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.example.invalid/v1',
      apiKey: 'desktop-decrypted-test-key',
      model: 'test-model',
      temperature: 0.4,
      maxTokens: 4_000,
      contextWindowTokens: 16_000
    })
    const provider = vi
      .fn<AgentProvider>()
      .mockResolvedValueOnce(
        JSON.stringify({
          template_html: '<article><h1>{{title}}</h1><div>{{content}}</div></article>',
          css: '.setting-card{color:#211d18}',
          notes: 'Missing image placeholder.'
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          template_html:
            '<article class="setting-card">{{image}}<h1>{{title}}</h1><div>{{content}}</div></article>',
          css: '.setting-card{box-sizing:border-box;color:#211d18;background:#f3ecde}',
          notes: 'Repaired.'
        })
      )

    const result = await designSettingCard(
      root,
      {
        document_id: 'char-yu-qian',
        document_type: 'character',
        style_direction: 'random',
        size: { width: 720, height: 1080 },
        base_style: null,
        language: 'zh'
      },
      { invokeProvider: provider }
    )

    expect(provider).toHaveBeenCalledTimes(2)
    const initialPrompt = provider.mock.calls[0]![0].messages.map((message) => message.content).join('\n')
    expect(initialPrompt).toContain('Random design variation #1')
    expect(initialPrompt).toContain('Primary composition:')
    expect(initialPrompt).toContain('Treat every axis below as mandatory')
    expect(result.candidate.template.template_html).toContain('{{image}}')
    expect(result.candidate.template.notes).toBe('Repaired.')
  })

  it('renders a selected built-in style without loading credentials or invoking a provider', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-setting-card-local-'))
    roots.push(root)
    await createProjectAt(root, { id: 'setting-card-local', title: 'Setting card local render' })
    await createCharacter(root, '于谦', { id: 'char-yu-qian', role: '大明重臣' }, '## 小传\n\n守住京城。')

    const result = await renderSettingCard(root, {
      document_id: 'char-yu-qian',
      source: { kind: 'builtin', id: 'modern-dossier' },
      size: { width: 720, height: 1080 },
      language: 'zh',
      preview: {
        id: 'char-yu-qian',
        type: 'character',
        title: '于谦',
        content: '## 小传\n\n守住京城。',
        fields: { role: '大明重臣' }
      }
    })

    expect(result.style).toBeNull()
    expect(result.template.notes).toContain('rendered locally without an Agent call')
    expect(result.html).toContain('<h2>小传</h2>')
    expect(result.html).toContain('人物定位')
    expect(desktopCredentials.loadDesktopAIProfile).not.toHaveBeenCalled()
  })

  it('opens the native Save As dialog and writes only the author-selected HTML file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-setting-card-save-as-'))
    roots.push(root)
    await createProjectAt(root, { id: 'setting-card-save-as', title: 'Setting card Save As' })
    await createCharacter(root, '于谦', { id: 'char-yu-qian' }, '## 小传\n\n守住京城。')
    const selectedWithoutExtension = path.join(root, 'author-choice', '于谦设定卡')
    await mkdir(path.dirname(selectedWithoutExtension), { recursive: true })
    await writeFile(`${selectedWithoutExtension}.html`, 'stale export', 'utf8')
    const showSaveDialog = vi.fn(async () => ({
      canceled: false,
      filePath: selectedWithoutExtension
    }))

    const result = await exportSettingCard(
      root,
      {
        document_id: 'char-yu-qian',
        template: defaultSettingCardTemplate('editorial'),
        size: { width: 720, height: 1080 },
        language: 'zh'
      },
      { dialog: { showSaveDialog }, defaultDirectory: root }
    )

    expect(showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '设定卡 HTML 另存为',
        defaultPath: path.join(root, '于谦.html'),
        buttonLabel: '保存',
        filters: [{ name: 'HTML', extensions: ['html'] }]
      })
    )
    expect(result).toEqual({
      canceled: false,
      file_name: '于谦设定卡.html',
      bytes: expect.any(Number)
    })
    const html = await readFile(`${selectedWithoutExtension}.html`, 'utf8')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('于谦')
    expect(html).toContain("default-src 'none'")
    expect(await pathExists(path.join(root, 'exports', 'setting-cards'))).toBe(false)
  })

  it('writes nothing when the author cancels the HTML Save As dialog', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-setting-card-save-cancel-'))
    roots.push(root)
    await createProjectAt(root, { id: 'setting-card-save-cancel', title: 'Setting card canceled Save As' })
    await createCharacter(root, '于谦', { id: 'char-yu-qian' }, 'A principled minister.')
    const canceledPath = path.join(root, 'must-not-be-written.html')
    const showSaveDialog = vi.fn(async () => ({ canceled: true, filePath: canceledPath }))

    const result = await exportSettingCard(
      root,
      {
        document_id: 'char-yu-qian',
        template: defaultSettingCardTemplate('minimal'),
        size: { width: 720, height: 1080 },
        language: 'zh'
      },
      { dialog: { showSaveDialog }, defaultDirectory: root }
    )

    expect(result).toEqual({ canceled: true, file_name: null, bytes: 0 })
    expect(await pathExists(canceledPath)).toBe(false)
    expect(await pathExists(path.join(root, 'exports', 'setting-cards'))).toBe(false)
  })
})
