import { describe, expect, it } from 'vitest'
import { deleteConfirmationMessage } from './delete-confirmation.js'

describe('delete confirmation copy', () => {
  it('warns that a story branch takes every descendant with it', () => {
    expect(
      deleteConfirmationMessage({
        type: 'outline',
        level: 'chapter',
        id: 'chapter-one',
        title: '第一章',
        acceptedScene: false,
        chapterSceneIds: undefined
      })
    ).toBe(
      '删除「第一章」及其全部下级内容？只要其中没有已发布正文，卷、篇、幕、章、节及相关运行记录都会一并删除。'
    )
  })

  it('promises the written text stays when the confirmed scene is already in chapter prose', () => {
    expect(
      deleteConfirmationMessage({
        type: 'scene',
        level: '',
        id: 'scene-one',
        title: '第一节',
        acceptedScene: true,
        chapterSceneIds: ['scene-one']
      })
    ).toBe(
      '删除节「第一节」？它的节文件和运行记录会删除；已经写入章正文的文字会保留，供你在章正文中手工调整。'
    )
  })

  it('keeps the outcome open when the confirmed scene is not in chapter prose yet', () => {
    expect(
      deleteConfirmationMessage({
        type: 'scene',
        level: '',
        id: 'scene-two',
        title: '第二节',
        acceptedScene: true,
        chapterSceneIds: ['scene-one']
      })
    ).toBe(
      '删除节「第二节」？节文件和运行记录会删除。若章正文尚未纳入本节，章正文不变；若已经写入，已写入的文字会留在章正文里供手改。'
    )
  })

  it('falls back to the plain document warning', () => {
    expect(
      deleteConfirmationMessage({
        type: 'scene',
        level: '',
        id: 'scene-three',
        title: '第三节',
        acceptedScene: false,
        chapterSceneIds: undefined
      })
    ).toBe('删除「第三节」？此操作会删除对应文件和相关运行记录。')
  })
})
