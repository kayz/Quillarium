import type { LanguageName } from '../app/types.js'

const FIELD_NAMES: Record<string, { zh: string; en: string }> = {
  timeline: { zh: '时间线', en: 'timeline' },
  location: { zh: '地点', en: 'location' },
  'POV character': { zh: '视角人物', en: 'POV character' }
}

export function formatDesktopError(err: unknown, language: LanguageName = 'en'): string {
  const raw = err instanceof Error ? err.message : String(err)
  const message = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()
  const zh = language === 'zh'

  const duplicateRoot = message.match(/this project already has an? (overview|book) document:\s*(.+)$/i)
  if (duplicateRoot) {
    const title = duplicateRoot[2].trim()
    if (duplicateRoot[1].toLowerCase() === 'overview') {
      return zh
        ? `项目已有总览“${title}”。请编辑现有总览，不能再创建第二个。`
        : `This project already has the overview “${title}”. Edit the existing overview instead.`
    }
    return zh
      ? `项目已有总纲“${title}”。请编辑现有总纲，不能再创建第二个。`
      : `This project already has the book outline “${title}”. Edit the existing book outline instead.`
  }
  if (
    /chooseImportSources is not a function/i.test(message) ||
    /desktop bridge is out of date.*import source picker/i.test(message)
  ) {
    return zh
      ? '客户端后台接口已更新。请重启 Quillarium 后重新选择文件。'
      : 'The desktop bridge was updated. Restart Quillarium, then choose the file again.'
  }
  if (/volume outline requires a parent/i.test(message)) {
    return zh
      ? '卷必须隶属于总纲。请先选择总纲，再创建或移动该卷。'
      : 'A volume must belong to the book outline. Select the book outline first.'
  }
  if (/timeline time is required|unsupported timeline time/i.test(message)) {
    return zh
      ? '无法识别故事时间。请至少填写到月份，例如“1449-08”“1449-08-15 09:30”或“20年秋”。'
      : 'Story time must be precise to at least a month, such as “1449-08”, “1449-08-15 09:30”, or “20 autumn”.'
  }
  if (/timeline month must be between 1 and 12|timeline month range/i.test(message)) {
    return zh ? '故事时间的月份必须在 1 到 12 之间。' : 'The Story time month must be between 1 and 12.'
  }
  if (/timeline event not found/i.test(message)) {
    return zh
      ? '没有找到用作时间来源的事件。请刷新时间线后重新选择。'
      : 'The source event could not be found. Refresh the timeline and select it again.'
  }
  const missingSceneFields = message.match(/cannot create a chapter scene[;:]?\s*missing\s+(.+?)\.?$/i)
  if (missingSceneFields) {
    const fields = missingSceneFields[1]
      .split(/,\s*|\s+and\s+/i)
      .map((field) => FIELD_NAMES[field.trim()]?.[language] ?? field.trim())
    return zh
      ? `生成本节前还需补充：${fields.join('、')}。可先创建节，再在元数据中选择。`
      : `Add ${fields.join(', ')} before generating this scene. You can create the scene first and complete its metadata.`
  }
  if (/AI writing can only create a scene under a chapter outline/i.test(message)) {
    return zh ? '只能在章节点下创建节。请先选择一章。' : 'Scenes can only be created under a chapter.'
  }
  if (/import session still has open issues/i.test(message)) {
    return zh ? '仍有待确认的导入问题，请处理后再导入。' : 'Resolve the remaining import questions first.'
  }
  if (/chapter outline not found|outline not found/i.test(message)) {
    return zh
      ? '没有找到对应的大纲节点，请刷新项目后重试。'
      : 'The outline could not be found. Refresh the project and try again.'
  }
  if (!message) return zh ? '操作未完成，请重试。' : 'The operation could not be completed. Try again.'
  if (zh) {
    return containsChinese(message) ? message : '操作未完成。请重试；若问题持续，请重启 Quillarium。'
  }
  return containsChinese(message)
    ? 'The operation could not be completed. Try again; if it persists, restart Quillarium.'
    : message
}

function containsChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value)
}
