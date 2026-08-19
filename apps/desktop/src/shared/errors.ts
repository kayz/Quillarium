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

  // Provider truncation details are intentionally shown verbatim in every UI language. They contain
  // the effective max_tokens value the author needs in order to adjust the connection profile.
  if (/AI_(?:OUTPUT_TRUNCATED|CONTEXT_WINDOW_EXCEEDED)/u.test(message)) return message

  if (/SENSITIVE_PROMPT_CONTENT/u.test(message)) {
    return zh
      ? '实际提示词中检出了凭据、Endpoint 或本机路径，本轮已在落盘和调用 AI 前停止。请修改所示来源后重新预览。'
      : 'The actual prompt contains a credential, endpoint, or machine-local path. The run stopped before persistence and provider I/O; fix the reported source and preview again.'
  }

  if (/SETTING_IMAGE_(?:TYPE_UNSUPPORTED|TYPE_MISMATCH|DECODE_FAILED)/u.test(message)) {
    return zh
      ? '无法读取这张图片。请选择内容与扩展名一致的 PNG、JPEG 或 WebP 文件。'
      : 'Quillarium could not read this image. Choose a PNG, JPEG, or WebP whose contents match its extension.'
  }
  if (/SETTING_IMAGE_DOCUMENT_HASH_CONFLICT/u.test(message)) {
    return zh
      ? '这张设定卡在选择图片期间发生了变化，图片未写入。请刷新卡片后重试。'
      : 'This setting changed while the image was being selected. Nothing was written; refresh the card and try again.'
  }
  if (/SETTING_IMAGE_(?:PATH_UNSAFE|DOCUMENT_PATH_UNSAFE|SYMLINK_FORBIDDEN)/u.test(message)) {
    return zh
      ? '图片目标路径不在当前项目的安全资产目录中，本次未写入。请检查项目目录后重试。'
      : 'The image target is outside the project-safe asset directory. Nothing was written; check the project folder and try again.'
  }

  if (/AGENT_AUTHOR_INPUT_REQUIRED/u.test(message)) {
    return zh ? '请输入本轮要讨论或检查的内容。' : 'Enter a message for this assistant turn.'
  }
  if (/AGENT_PROVIDER_AUTH_FAILED/u.test(message)) {
    return zh
      ? '模型服务拒绝了当前凭据。请在“设置 → AI 配置”中重新保存对应 API Key。'
      : 'The model provider rejected the current credential. Re-save the matching API key under Settings → AI.'
  }
  if (/AGENT_PROVIDER_(?:QUOTA_EXCEEDED|RATE_LIMITED)/u.test(message)) {
    return zh
      ? '模型服务当前限流或额度不足，本轮没有生成候选。请检查额度或稍后重试。'
      : 'The model provider is rate-limited or out of quota. No candidate was generated; check quota or try again later.'
  }
  if (/AGENT_PROVIDER_TIMEOUT/u.test(message)) {
    return zh
      ? '模型服务响应超时，本轮没有生成候选。请检查连接后重试。'
      : 'The model provider timed out. No candidate was generated; check the connection and try again.'
  }
  if (/AGENT_PROVIDER_CONTEXT_EXCEEDED/u.test(message)) {
    return zh
      ? '本轮资料超过模型上下文上限。请缩短设定内容或改用更大上下文模型。'
      : 'This request exceeded the model context window. Shorten the setting content or use a larger-context model.'
  }
  if (/AGENT_PROVIDER_TRANSPORT_FAILED/u.test(message)) {
    return zh
      ? '无法连接模型服务，本轮没有生成候选。请检查模型、Endpoint 和网络后重试。'
      : 'Quillarium could not reach the model provider. No candidate was generated; check the model, endpoint, and network.'
  }
  if (/AGENT_EMPTY_RESPONSE/u.test(message)) {
    return zh
      ? '模型返回了空内容，本轮没有生成候选。请重试或切换模型。'
      : 'The model returned an empty response. No candidate was generated; retry or choose another model.'
  }
  if (/AGENT_AI_NOT_CONFIGURED/u.test(message)) {
    return zh
      ? '创作助手所用的 AI 配置尚不可用。请在“设置 → AI 配置”中保存对应模型和密钥。'
      : 'The AI profile used by this creator assistant is not configured. Save its model and key under Settings → AI.'
  }
  if (
    /CONTEXT_REQUIRED_SOURCE_MISSING/u.test(message) ||
    /Required context source is missing/u.test(message)
  ) {
    return zh
      ? '资料包缺少必需资料，本轮已停止。请恢复该卡片，或由作者修改资料包。'
      : 'A required ContextBundle source is missing. Restore it or edit the bundle before running.'
  }
  if (
    /CONTEXT_REQUIRED_SOURCE_DUPLICATE/u.test(message) ||
    /Required context source is ambiguous/u.test(message)
  ) {
    return zh
      ? '同一必需资料 ID 对应多个文件，本轮已停止。请先消除重复 ID。'
      : 'A required source ID resolves to multiple files. Remove the duplicate ID before running.'
  }
  if (
    /CONTEXT_REQUIRED_SELECTOR_EMPTY/u.test(message) ||
    /Required context selector returned no/u.test(message)
  ) {
    return zh
      ? '必需的动态资料范围为空，本轮已停止。请补齐当前目标或相关资料。'
      : 'A required dynamic context selector returned no sources. Complete the target context first.'
  }
  if (/STRUCTURED_OUTPUT_INVALID_JSON/u.test(message)) {
    return zh
      ? 'AI 返回内容不是有效的结构化结果；系统已保留原始响应供审计。'
      : 'The AI response was not valid structured JSON. The raw response was retained for audit.'
  }
  if (/AI_IMPORT_INVALID_RESPONSE/u.test(message)) {
    return zh
      ? 'AI 返回的拆分结果不完整或格式错误，本轮没有导入任何内容。请重试；材料很长时可分批导入。'
      : 'The AI returned an incomplete or invalid import plan. Nothing was imported. Try again, or split very long source material into batches.'
  }
  if (/STRUCTURED_OUTPUT_SCHEMA_MISMATCH/u.test(message)) {
    return zh
      ? 'AI 返回字段不符合本任务的结果格式；系统已保留原始响应供审计。'
      : 'The AI response did not match this task’s output schema. The raw response was retained for audit.'
  }
  if (
    /STRUCTURED_OUTPUT_REPAIR_FAILED/u.test(message) ||
    /failed validation after one repair/u.test(message)
  ) {
    return zh
      ? 'AI 结果经一次修复后仍不符合格式。本轮没有生成提案，原始与修复响应均已保存。'
      : 'The response still failed after one repair. No proposal was created; both responses were saved.'
  }
  if (/STALE_PROJECT_WRITE/u.test(message) || /Project data changed after it was loaded/u.test(message)) {
    return zh
      ? '资料在打开后已被其他操作修改。系统没有覆盖新内容，请刷新后重试。'
      : 'The data changed after it was loaded. Nothing was overwritten; refresh and try again.'
  }
  if (/AGENT_PERMISSION_DENIED/u.test(message)) {
    return zh
      ? '该创作助手没有执行此操作的权限；本轮没有写入项目。'
      : 'This creator assistant is not allowed to perform that operation. Nothing was written.'
  }
  if (/AGENT_(?:EXECUTION_SNAPSHOT|TURN_|SESSION_|CONFIGURATION_SNAPSHOT_MISMATCH)/u.test(message)) {
    return zh
      ? '创作助手的会话或运行快照与当前任务不一致。系统已停止处理，未覆盖项目内容。请刷新会话后重试。'
      : 'The creator-assistant session or execution snapshot does not match this task. Processing stopped without overwriting project data; refresh and try again.'
  }
  if (/AGENT_(?:OUTPUT|CONFIGURATION_PROPOSAL|CONFIGURATION_PLAN|CONFIGURATION_SNAPSHOT)_/u.test(message)) {
    return zh
      ? '创作助手返回的提案或配置变更不符合任务约束。本轮未写入项目，原始结果已保留供审计。'
      : 'The assistant returned a proposal or configuration change outside the task contract. Nothing was written; the raw result was retained.'
  }
  if (/AUTHOR_APPROVAL_REQUIRED/u.test(message)) {
    return zh
      ? '此变更必须由作者明确批准后才能应用。'
      : 'This change requires explicit author approval before it can be applied.'
  }
  if (/STORY_ORDER_CONFLICT|STORY_ORDER_HASH_CONFLICT/u.test(message)) {
    return zh
      ? '故事树顺序已被其他操作修改。系统没有覆盖新内容，请刷新后重试。'
      : 'The story order changed elsewhere. Nothing was overwritten; refresh and try again.'
  }
  if (/STORY_ORDER_CROSS_PARENT/u.test(message)) {
    return zh
      ? '本轮只能在同一父节点内排序，不能通过拖动改变层级或父节点。'
      : 'Reordering is limited to one parent; dragging cannot change a node’s parent or level.'
  }
  if (/STORY_ORDER_(?:VERIFY|ROLLBACK)_FAILED/u.test(message)) {
    return zh
      ? '故事树排序未能安全保存。系统已尝试恢复原顺序，请查看诊断日志后再继续编辑。'
      : 'The story order could not be saved safely. Quillarium attempted rollback; inspect the diagnostic log before continuing.'
  }
  if (/AGENT_PROPOSAL_(?:NOT_FOUND|ALREADY_|DOCUMENT_TYPE_)/u.test(message)) {
    return zh
      ? '这条提案已失效、已处理或目标类型不允许写入。请刷新会话后检查。'
      : 'This proposal is stale, already handled, or targets a forbidden document type. Refresh the session.'
  }

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
      ? '无法识别故事时间。可填写“1449-08”“1449-08-15 09:30”“20年秋”或“第1周周二”。'
      : 'Use a story time such as “1449-08”, “1449-08-15 09:30”, “20 autumn”, or “week 1 day 2”.'
  }
  if (/timeline month must be between 1 and 12|timeline month range/i.test(message)) {
    return zh ? '故事时间的月份必须在 1 到 12 之间。' : 'The Story time month must be between 1 and 12.'
  }
  if (/timeline event not found/i.test(message)) {
    return zh
      ? '没有找到用作时间来源的事件。请刷新时间线后重新选择。'
      : 'The source event could not be found. Refresh the timeline and select it again.'
  }
  if (/planning card changed outside this conversation/i.test(message)) {
    return zh
      ? '这张卡片在对话期间已被其他操作修改。系统没有覆盖新内容，请关闭对话并重新打开卡片。'
      : 'This card changed while the conversation was open. Nothing was overwritten; close and reopen the card.'
  }
  if (/planning card type migration target already exists/i.test(message)) {
    return zh
      ? '目标类型中已有同名迁移文件。原卡片仍然保留；请检查重复卡片后重试。'
      : 'A migration file already exists in the target type. The original card was retained; resolve the duplicate and retry.'
  }
  if (/planning card type migration failed and rollback was incomplete/i.test(message)) {
    return zh
      ? '卡片类型迁移失败，且自动恢复未完整完成。请暂停编辑并查看桌面诊断日志。'
      : 'The card type migration failed and automatic recovery was incomplete. Stop editing and inspect the desktop diagnostic log.'
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
