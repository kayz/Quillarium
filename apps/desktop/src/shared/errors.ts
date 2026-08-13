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
  if (/finalize review input does not match the authoritative chapter prose/i.test(message)) {
    return zh
      ? '反查所用正文与当前章正文不一致。请保存章正文后重新生成定稿反查。'
      : 'The reviewed text no longer matches the chapter prose. Save it and create a new final review.'
  }
  if (
    /finalization source changed (?:while the review was running|after review|during apply|before verification)/i.test(
      message
    )
  ) {
    return zh
      ? '章节点或已定稿正文在反查后发生了变化。为避免写入过期结论，请重新生成定稿反查。'
      : 'The chapter or final prose changed after review. Create a new final review before applying continuity.'
  }
  if (/finalization source chapter prose is not final/i.test(message)) {
    return zh
      ? '只有已定稿正文才能执行连续性回写。请先将本章定稿。'
      : 'Continuity apply requires finalized chapter prose. Finalize this chapter first.'
  }
  if (
    /finalization source (?:chapter|chapter prose) not found|finalization review lacks a source snapshot/i.test(
      message
    )
  ) {
    return zh
      ? '找不到本次反查所对应的章或正文快照。请刷新项目并重新生成定稿反查。'
      : 'The source chapter or its prose snapshot is missing. Refresh and create a new final review.'
  }
  if (
    /finalization review is not ready to apply|finalization review still has open decisions/i.test(message)
  ) {
    return zh
      ? '定稿反查仍有待作者决定的影响项或问题，请全部确认、拒绝、答复或暂缓后再应用。'
      : 'Resolve every open impact and question before applying this final review.'
  }
  if (
    /finalize impact lacks an explicit create\/update operation|finalize impact lacks a stable target_id|finalize impact has no structured frontmatter or content change/i.test(
      message
    )
  ) {
    return zh
      ? '此影响项缺少可执行的结构化目标或内容，不能安全回写。请拒绝此项并重新反查。'
      : 'This impact lacks a safe structured target or change set. Reject it and create a new review.'
  }
  if (
    /finalization target changed after review|target hash changed during apply|create target appeared during apply/i.test(
      message
    )
  ) {
    return zh
      ? '目标资料在反查后已被修改。系统没有覆盖新内容；请重新生成定稿反查。'
      : 'A target changed after review. Nothing was overwritten; create a new final review.'
  }
  if (/finalization apply failed and was rolled back/i.test(message)) {
    return zh
      ? '连续性回写失败，所有目标和反查状态已恢复。可检查审计记录后重试。'
      : 'Continuity apply failed and every target was restored. Inspect the audit before retrying.'
  }
  if (/could not recover finalization application|rollback failed/i.test(message)) {
    return zh
      ? '自动恢复未完成。请停止继续写入，并依据定稿回写审计中的备份路径进行恢复。'
      : 'Automatic recovery did not complete. Stop writing and recover from the backup paths in the audit.'
  }
  if (/import session still has open issues/i.test(message)) {
    return zh ? '仍有待确认的导入问题，请处理后再导入。' : 'Resolve the remaining import questions first.'
  }
  const missingPreset = message.match(/writing preset not found:\s*([a-z0-9-]+)/i)
  if (missingPreset) {
    return zh
      ? `找不到写作预设“${missingPreset[1]}”。请在设置中选择已有预设，或创建默认预设。`
      : `Writing preset “${missingPreset[1]}” was not found. Select an existing preset or create the default in Settings.`
  }
  if (/no writing preset is selected/i.test(message)) {
    return zh
      ? '当前项目尚未选择写作预设。请在设置中选择已有预设，或创建默认预设。'
      : 'No writing preset is selected. Select an existing preset or create the default in Settings.'
  }
  if (/unsupported writing preset schema_version/i.test(message)) {
    return zh
      ? '所选写作预设来自不兼容的版本。请先迁移该预设，再进行生成。'
      : 'The selected writing preset uses an unsupported schema. Migrate it before generating.'
  }
  if (
    /writingpreset snapshot|writing preset snapshot hash|contexttrace and writingpreset|AI configuration does not match the immutable writingpreset/i.test(
      message
    )
  ) {
    return zh
      ? '写作预设快照与本次运行不一致，已停止生成以避免不可复现的结果。请重新组装上下文。'
      : 'The WritingPreset snapshot does not match this run. Generation stopped to avoid an unreproducible result; assemble the context again.'
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
