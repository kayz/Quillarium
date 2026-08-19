import type { LanguageName } from '../../app/types.js'

export interface FieldPresentation {
  label: string
  description: string
  known: boolean
}

export interface FieldPresentationContext {
  documentType?: string
  documentId?: string
}

interface LocalizedFieldDefinition {
  zh: Omit<FieldPresentation, 'known'>
  en: Omit<FieldPresentation, 'known'>
}

function field(
  zhLabel: string,
  zhDescription: string,
  enLabel: string,
  enDescription: string
): LocalizedFieldDefinition {
  return {
    zh: { label: zhLabel, description: zhDescription },
    en: { label: enLabel, description: enDescription }
  }
}

const FIELD_DEFINITIONS: Record<string, LocalizedFieldDefinition> = {
  title: field('名称', '用户在列表和引用中看到的名称。', 'Name', 'The name shown in lists and references.'),
  name: field(
    '名称（旧字段）',
    '从旧资料保留的名称；整理时可并入当前文档名称。',
    'Legacy name',
    'A name preserved from legacy material; it can be merged into the current document name.'
  ),
  ID: field(
    '原始编号',
    '导入资料原有的编号，仅用于追溯来源。',
    'Original ID',
    'The identifier from imported material, retained for source tracing.'
  ),
  import_target_type: field(
    '目标类型',
    '确认这条候选内容写入世界书、人物、时间线或其它哪类资料。',
    'Target type',
    'Choose whether this candidate becomes a world entry, character, timeline event, or another record.'
  ),
  document_type: field(
    '文档类型',
    '决定这张卡片在项目中的用途、可用属性与关联方式。',
    'Document type',
    'Determines this card’s purpose, available properties, and relationship options in the project.'
  ),
  canon_content: field(
    '正设内容',
    '已经确认、生成和检查都必须遵守的权威事实。',
    'Canon content',
    'Authoritative facts that generation and checks must follow.'
  ),
  status: field(
    '状态',
    '表示这项内容目前处于哪个使用阶段。',
    'Status',
    'The current lifecycle stage of this record.'
  ),
  tags: field(
    '标签',
    '用于跨类型归类、检索和查找相关内容。',
    'Tags',
    'Classify, search, and connect records across types.'
  ),
  tag: field(
    '标签（旧字段）',
    '旧资料中的单个标签；整理时可并入标签列表。',
    'Legacy tag',
    'A single tag from legacy material; it can be merged into the tag list.'
  ),
  strength: field(
    '约束强度',
    '决定生成与检查时应当多严格地遵守这项设定。',
    'Constraint strength',
    'How strictly generation and checks must follow this fact.'
  ),
  source: field(
    '信息来源',
    '记录这项内容来自作者、AI、导入材料或历史资料。',
    'Information source',
    'Where this record came from: author, AI, import, or research.'
  ),
  aliases: field(
    '别名',
    '人物、地点或事物可以被检索到的其它名称。',
    'Aliases',
    'Other names that can be used to find this record.'
  ),
  image: field(
    '设定图片',
    '项目内原图、缩略图、尺寸、焦点和色板的受控相对路径元数据；请通过图片面板管理。',
    'Setting image',
    'Controlled project-relative metadata for the original, thumbnail, dimensions, focus, and palette; manage it through the image panel.'
  ),
  role: field(
    '叙事作用',
    '说明这项内容在故事中承担的主要功能。',
    'Story role',
    'The main function this record serves in the story.'
  ),
  POV: field(
    '视角人物（旧字段）',
    '旧资料记录的叙事视角人物；整理时可并入标准视角字段。',
    'Point-of-view character (legacy)',
    'The viewpoint character recorded by legacy material; it can be merged into the standard POV field.'
  ),
  speech_style: field(
    '说话方式',
    '人物常用的语气、措辞、节奏和表达习惯。',
    'Speech style',
    'The character’s typical tone, wording, rhythm, and habits.'
  ),
  desire: field(
    '核心欲望',
    '人物主动追求、会推动其采取行动的目标。',
    'Core desire',
    'What the character actively wants and acts to obtain.'
  ),
  fear: field(
    '核心恐惧',
    '人物最想避免、会影响其选择的结果。',
    'Core fear',
    'The outcome the character most wants to avoid.'
  ),
  bottom_line: field(
    '行为底线',
    '人物通常不会跨越的道德或现实边界。',
    'Red line',
    'A moral or practical boundary the character normally will not cross.'
  ),
  motivation_anchors: field(
    '动机锚点',
    '用于判断人物行动是否合理的一组稳定动机。',
    'Motivation anchors',
    'Stable motives used to judge whether actions remain believable.'
  ),
  relationships: field(
    '旧人物关系备注',
    '兼容旧项目的静态关系说明；不会进入时态关系图，请使用独立人物关系卡。',
    'Legacy relationship notes',
    'Static notes kept for compatibility; they do not enter the timed graph. Use relationship cards instead.'
  ),
  arc: field(
    '人物弧线',
    '按故事阶段记录人物从起点到终点的变化。',
    'Character arc',
    'How the character changes from start to end across story stages.'
  ),
  start: field(
    '开始状态',
    '本阶段开始时的状态、立场或关系。',
    'Starting state',
    'The state, position, or relationship at the start of this stage.'
  ),
  end: field(
    '结束状态',
    '本阶段结束后形成的新状态、立场或关系。',
    'Ending state',
    'The new state, position, or relationship after this stage.'
  ),
  notes: field(
    '补充说明',
    '无法归入其它字段、但需要保留的说明。',
    'Notes',
    'Additional information that does not belong in another field.'
  ),
  ooc_guardrails: field(
    '人物失真约束',
    '防止人物做出违背既定性格与经历的行为。',
    'Character guardrails',
    'Rules that prevent behavior inconsistent with the established character.'
  ),
  active_flags: field(
    '当前标记',
    '人物此刻仍然生效的状态或提醒。',
    'Active flags',
    'States or reminders currently in effect for the character.'
  ),
  disclosure: field(
    '信息揭示计划',
    '安排人物信息在何时、对谁被揭示。',
    'Disclosure plan',
    'When and to whom character information is revealed.'
  ),
  segment: field(
    '所属阶段',
    '这项变化或揭示发生在哪个故事阶段。',
    'Story stage',
    'The story stage in which this change or reveal occurs.'
  ),
  reveal_after: field(
    '揭示时点',
    '达到哪个节点后才允许揭示这项信息。',
    'Reveal after',
    'The node after which this information may be revealed.'
  ),
  scene_state: field(
    '当前场景状态',
    '写作下一节时需要沿用的人物即时状态。',
    'Current scene state',
    'Immediate character state that the next scene must continue from.'
  ),
  current_location: field(
    '当前位置',
    '人物在当前连续性节点所在的地点。',
    'Current location',
    'Where the character is at the current continuity point.'
  ),
  outfit_layers: field(
    '衣着层次',
    '当前穿着及其层次，用于保持场景连续性。',
    'Outfit layers',
    'Current clothing layers used to preserve scene continuity.'
  ),
  wounds: field(
    '伤势',
    '仍需在动作和感受中体现的身体伤势。',
    'Injuries',
    'Physical injuries that must still affect action and sensation.'
  ),
  carried_items: field(
    '随身物品',
    '人物当前携带、可在场景中使用的物品。',
    'Carried items',
    'Items the character currently carries and can use.'
  ),
  known_facts: field(
    '已知事实',
    '人物此时已经知道、可以据此行动的信息。',
    'Known facts',
    'Information the character currently knows and may act upon.'
  ),
  emotional_state: field(
    '情绪状态',
    '进入下一节时人物主要的情绪与心理倾向。',
    'Emotional state',
    'The character’s main emotion and mindset entering the next scene.'
  ),
  code: field(
    '识别码',
    '用于稳定引用这项设定或伏笔的短编码。',
    'Reference code',
    'A short stable code used to reference this record.'
  ),
  level: field(
    '层级',
    '表示这项内容在所属结构中的层级。',
    'Level',
    'The level of this record within its structure.'
  ),
  summary: field(
    '摘要',
    '用简短文字概括这项内容的核心。',
    'Summary',
    'A short statement of the record’s essential meaning.'
  ),
  planned_plant: field(
    '旧计划埋设文字',
    '兼容旧项目的自由文本；完成时间引用迁移前不会自动删除。',
    'Legacy planting text',
    'Free text retained for compatibility until an explicit story-time migration.'
  ),
  planned_plant_ref: field(
    '计划埋设时间位置',
    '以稳定时间线、时间节点或事件引用定位，可继续关联章或节。',
    'Planned planting time',
    'A stable timeline, node, or event reference with an optional chapter or section link.'
  ),
  planted_at: field(
    '实际埋设',
    '这条伏笔实际进入已接受正文的节点。',
    'Planted at',
    'Where this foreshadowing actually entered accepted prose.'
  ),
  reinforced_at: field(
    '强化记录',
    '后续再次提醒或加强这条伏笔的节点。',
    'Reinforced at',
    'Later nodes that remind or reinforce this foreshadowing.'
  ),
  planned_resolve: field(
    '旧计划回收文字',
    '兼容旧项目的自由文本；完成时间引用迁移前不会自动删除。',
    'Legacy resolution text',
    'Free text retained for compatibility until an explicit story-time migration.'
  ),
  planned_resolve_ref: field(
    '计划回收时间位置',
    '以稳定时间线、时间节点或事件引用定位，可继续关联章或节。',
    'Planned resolution time',
    'A stable timeline, node, or event reference with an optional chapter or section link.'
  ),
  expires_at: field(
    '最晚回收点',
    '超过这个节点仍未处理就应当发出提醒。',
    'Resolution deadline',
    'The latest node before unresolved foreshadowing should trigger a warning.'
  ),
  state: field(
    '处理状态',
    '表示这项内容当前已进行到哪一步。',
    'Progress state',
    'How far this record has progressed.'
  ),
  related_characters: field(
    '关联人物',
    '与这项内容直接有关的人物。',
    'Related characters',
    'Characters directly connected to this record.'
  ),
  related_arc: field(
    '关联篇',
    '这项内容主要服务的篇；旧文档可能仍使用此字段。',
    'Related part',
    'The part primarily served by this record; retained for legacy files.'
  ),
  triggers: field(
    '触发词',
    '出现这些词时，系统可以把该世界书条目加入上下文。',
    'Trigger words',
    'Words that can activate this world entry for context assembly.'
  ),
  trigger_words: field(
    '触发词',
    '旧文档使用的触发词字段；作用与“触发词”相同。',
    'Trigger words',
    'Legacy trigger-word field with the same purpose as Trigger words.'
  ),
  category_tags: field(
    '分类标签',
    '按主题或知识类别组织世界书条目。',
    'Category tags',
    'Organize world entries by subject or knowledge category.'
  ),
  valid_from: field(
    '生效起点',
    '这项设定从哪个时间或故事节点开始有效。',
    'Valid from',
    'The time or story node from which this fact becomes valid.'
  ),
  valid_until: field(
    '失效终点',
    '这项设定到哪个时间或故事节点为止有效；留空表示持续有效。',
    'Valid until',
    'The time or story node until which this fact remains valid; blank means ongoing.'
  ),
  entry_status: field(
    '条目状态',
    '决定世界书条目是否可被上下文系统使用。',
    'Entry status',
    'Whether this world entry is available to context assembly.'
  ),
  importance: field(
    '重要程度',
    '上下文预算不足时用于决定保留顺序。',
    'Importance',
    'Used to decide which context survives when the budget is tight.'
  ),
  historical_reference: field(
    '历史参照',
    '真实历史、制度或技术方面的参考依据。',
    'Historical reference',
    'Real historical, institutional, or technical grounding.'
  ),
  story_setting: field(
    '故事内设定',
    '历史参照在本故事世界中的改写与实际规则。',
    'Story-world setting',
    'How the reference is adapted into rules for this story world.'
  ),
  used_in: field(
    '使用记录',
    '记录这项设定在哪些场景中被使用以及如何使用。',
    'Usage records',
    'Where this fact was used and what purpose it served.'
  ),
  scene: field(
    '场景',
    '使用这项内容的节或场景标识。',
    'Scene',
    'The scene or section that uses this record.'
  ),
  usage: field('使用方式', '说明该场景如何运用这项内容。', 'Usage', 'How the record is used in that scene.'),
  links: field(
    '关联文档',
    '与这项内容有关的项目内文档链接。',
    'Linked documents',
    'Project documents connected to this record.'
  ),
  source_title: field(
    '资料名称',
    '参考资料原本的标题。',
    'Source title',
    'The original title of the reference material.'
  ),
  author: field(
    '作者或机构',
    '参考资料的作者、编者或发布机构。',
    'Author or organization',
    'The author, editor, or publishing organization.'
  ),
  material_type: field(
    '资料类型',
    '区分书籍、论文、网页、视频等资料载体。',
    'Material type',
    'Whether the source is a book, paper, webpage, video, or another medium.'
  ),
  location: field(
    '地点或位置',
    '地点引用，或资料在本地/网络中的存放位置。',
    'Location',
    'A place reference, or where a source can be found.'
  ),
  reading_status: field(
    '阅读状态',
    '标记资料尚未阅读、正在阅读或已经读完。',
    'Reading status',
    'Whether the source is unread, in progress, or finished.'
  ),
  topic_tags: field(
    '主题标签',
    '按研究主题组织参考资料。',
    'Topic tags',
    'Organize reference materials by research topic.'
  ),
  extracted_entries: field(
    '摘录条目',
    '从资料中提取并值得复用的观点或事实。',
    'Extracted notes',
    'Reusable facts or ideas extracted from the source.'
  ),
  value_assessment: field(
    '价值判断',
    '说明这份资料对当前作品的用途与可信度。',
    'Value assessment',
    'How useful and trustworthy this source is for the project.'
  ),
  priority: field(
    '优先级',
    '决定这项问题或任务应当多快处理。',
    'Priority',
    'How urgently this issue or task should be handled.'
  ),
  due: field(
    '期望处理时间',
    '希望完成决策或处理的时间。',
    'Due',
    'When the decision or work should be completed.'
  ),
  decision_needed: field(
    '待做决定',
    '写清需要作者确认的具体问题。',
    'Decision needed',
    'The specific question the author needs to decide.'
  ),
  related_docs: field(
    '关联资料',
    '与这个问题或记录有关的项目文档。',
    'Related records',
    'Project records connected to this issue.'
  ),
  category: field(
    '分类',
    '按叙事、文风、节奏等用途归类策略。',
    'Category',
    'Classify the strategy by narrative, style, pacing, or another purpose.'
  ),
  scope: field(
    '适用范围',
    '决定这项规则在哪些层级或对象上生效。',
    'Applies at',
    'The levels or targets to which this rule applies.'
  ),
  principles: field(
    '应遵循原则',
    '生成和修改时应当主动遵循的规则。',
    'Principles to follow',
    'Rules generation and revision should actively follow.'
  ),
  avoid: field(
    '应避免事项',
    '写作时应当避免出现的做法或倾向。',
    'Things to avoid',
    'Practices or tendencies writing should avoid.'
  ),
  kind: field(
    '模式类型',
    '区分故事结构、写作风格和提示词模式。',
    'Pattern type',
    'Whether this is a story, writing, or prompt pattern.'
  ),
  applies_to: field(
    '适用标签',
    '用标签限定模式适用的内容。',
    'Applies to tags',
    'Tags that limit where this pattern should be used.'
  ),
  character: field(
    '人物',
    '这份状态快照所属的人物。',
    'Character',
    'The character this state snapshot belongs to.'
  ),
  scope_type: field(
    '作用对象类型',
    '状态快照绑定的时间线、大纲或场景类型。',
    'Target type',
    'Whether this state is attached to a timeline, outline, or scene.'
  ),
  scope_id: field(
    '作用对象',
    '状态快照绑定的具体节点。',
    'Target record',
    'The specific record this state snapshot is attached to.'
  ),
  timeline_node: field(
    '时间线节点',
    '当前内容在时间线中的对应事件。',
    'Timeline node',
    'The timeline event corresponding to this content.'
  ),
  motivation: field(
    '当前动机',
    '人物在这个节点最直接的行动动力。',
    'Current motivation',
    'The character’s immediate reason for acting at this point.'
  ),
  emotion: field(
    '当前情绪',
    '人物在这个节点的主要情绪。',
    'Current emotion',
    'The character’s main emotion at this point.'
  ),
  knowledge: field(
    '掌握信息',
    '人物在这个节点已经知道的事实。',
    'Knowledge',
    'Facts the character knows at this point.'
  ),
  relationship_delta: field(
    '关系变化',
    '这个节点造成的人物关系变化。',
    'Relationship changes',
    'How relationships change at this point.'
  ),
  public_disclosure: field(
    '公开信息',
    '到这个节点已经对外公开的信息。',
    'Public disclosures',
    'Information that has become public by this point.'
  ),
  date: field(
    '故事时间',
    '事件在故事世界中的日期或相对时间。',
    'Story date',
    'The date or relative time of the event in the story world.'
  ),
  previous: field(
    '前一事件',
    '时间线主链中紧接在前的事件。',
    'Previous event',
    'The immediately preceding event in the main timeline chain.'
  ),
  next: field(
    '后一事件',
    '时间线主链中紧接在后的事件。',
    'Next event',
    'The immediately following event in the main timeline chain.'
  ),
  duration: field('持续时间', '事件从开始到结束所经历的时间。', 'Duration', 'How long the event lasts.'),
  characters: field(
    '出场人物',
    '参与这个事件或场景的人物。',
    'Characters present',
    'Characters participating in this event or scene.'
  ),
  flashback_reference: field(
    '回忆对应事件',
    '如果这是回忆，指向它在真实时间线中的事件。',
    'Flashback event',
    'The real timeline event represented by this flashback.'
  ),
  parent_location: field(
    '上级地点',
    '包含当前地点的更大区域或场所。',
    'Parent location',
    'The larger area or place containing this location.'
  ),
  description: field(
    '地点说明',
    '地点的空间特征、功能和叙事用途。',
    'Description',
    'Spatial features, function, and story use of this location.'
  ),
  from: field('起点', '路线开始的地点。', 'From', 'The location where the route begins.'),
  to: field('终点', '路线到达的地点。', 'To', 'The destination of the route.'),
  distance_li: field(
    '距离（里）',
    '路线的大致里程；未知时可以留空。',
    'Distance (li)',
    'Approximate route distance in li; may be blank when unknown.'
  ),
  travel_time_days: field(
    '行程天数',
    '通常情况下走完路线所需的天数。',
    'Travel time (days)',
    'Typical number of days required to travel the route.'
  ),
  route_type: field(
    '路线类型',
    '道路、水路、山道等通行方式。',
    'Route type',
    'Road, waterway, mountain path, or another travel mode.'
  ),
  restriction: field(
    '通行限制',
    '季节、身份、关卡或其它通行条件。',
    'Travel restrictions',
    'Seasonal, identity, checkpoint, or other travel limits.'
  ),
  parent: field(
    '父节点',
    '故事树中直接包含当前节点的上一级节点。',
    'Parent node',
    'The direct parent of this node in the story tree.'
  ),
  order: field(
    '排列顺序',
    '同一父节点下内容的显示和写作顺序。',
    'Order',
    'Display and writing order among siblings under the same parent.'
  ),
  target_words: field(
    '目标字数',
    '这部分内容期望达到的大致字数。',
    'Target words',
    'Approximate intended length of this content.'
  ),
  chapter_hook: field(
    '章末钩子',
    '标记本节是否承担章末继续阅读的钩子。',
    'Chapter-end hook',
    'Whether this scene carries the chapter’s read-on hook.'
  ),
  story_purpose: field(
    '故事目的',
    '用一句话说明整部作品最终想完成什么。',
    'Story purpose',
    'One sentence stating what the whole story is meant to accomplish.'
  ),
  core_characters: field(
    '核心人物',
    '推动整部故事主矛盾的人物。',
    'Core characters',
    'Characters who drive the story’s central conflict.'
  ),
  central_conflict: field(
    '主要矛盾',
    '贯穿整部作品、持续推动选择与行动的矛盾。',
    'Central conflict',
    'The conflict that continually drives choices and action.'
  ),
  final_direction: field(
    '最终方向',
    '故事最终将人物与世界推向的方向。',
    'Final direction',
    'Where the story ultimately takes its characters and world.'
  ),
  worldline_axis: field(
    '世界线主轴',
    '全书世界格局变化的主要发展线。',
    'Worldline axis',
    'The main line of change in the story world.'
  ),
  character_destiny_axis: field(
    '人物命运线',
    '核心人物命运变化的主要发展线。',
    'Character destiny axis',
    'The main progression of the core characters’ fates.'
  ),
  key_stages: field(
    '关键阶段',
    '全书发展过程中必须经过的主要阶段。',
    'Key stages',
    'Major stages the whole story must pass through.'
  ),
  causal_chain: field(
    '因果链',
    '连接关键阶段与最终结果的因果关系。',
    'Causal chain',
    'Cause-and-effect links connecting major stages to the ending.'
  ),
  final_state: field(
    '最终状态',
    '故事结束时人物、关系与世界形成的状态。',
    'Final state',
    'The state of characters, relationships, and world at the ending.'
  ),
  stage_goal: field(
    '阶段目标',
    '本篇或本幕完成时必须达成的目标。',
    'Stage goal',
    'What this part or act must accomplish by its end.'
  ),
  irreversible_change: field(
    '不可逆变化',
    '本阶段结束后无法轻易恢复的局势或关系变化。',
    'Irreversible change',
    'A situation or relationship change that cannot easily be undone.'
  ),
  reader_promise: field(
    '读者承诺',
    '这一阶段向读者承诺会看到或获得的体验。',
    'Reader promise',
    'The experience or development this stage promises the reader.'
  ),
  reader_payoff: field(
    '读者兑现',
    '本阶段实际交付给读者的结果或满足。',
    'Reader payoff',
    'The result or satisfaction this stage actually delivers.'
  ),
  reader_benefit: field(
    '本次阅读收益',
    '读完这部分后读者获得的新信息、情绪或局势变化。',
    'Reader benefit',
    'New information, emotion, or situation the reader gains here.'
  ),
  core_appeal: field(
    '核心看点',
    '这一阶段最值得读者期待的内容。',
    'Core appeal',
    'What makes this stage most worth reading.'
  ),
  core_suspense: field(
    '核心悬念',
    '推动读者继续阅读的主要未知问题。',
    'Core suspense',
    'The main unanswered question driving continued reading.'
  ),
  genre_boundary: field(
    '类型边界',
    '必须保留或避免突破的题材与类型约束。',
    'Genre boundaries',
    'Genre expectations that must be preserved or deliberately avoided.'
  ),
  volume_goal: field(
    '本卷目标',
    '本卷结束前必须完成的阶段性结果。',
    'Volume goal',
    'The stage result that must be achieved before this volume ends.'
  ),
  event_chain: field(
    '事件链',
    '按因果和顺序连接本阶段的关键事件。',
    'Event chain',
    'Key events connected by cause and sequence in this stage.'
  ),
  character_growth: field(
    '人物成长',
    '本阶段人物能力、认知或关系的主要变化。',
    'Character growth',
    'Major changes in ability, understanding, or relationships.'
  ),
  story_cycles: field(
    '故事循环',
    '本阶段推进的欲望、压力、成长、揭示或关系循环。',
    'Story cycles',
    'Desire, pressure, growth, reveal, or relationship cycles advanced here.'
  ),
  conflict_ladder: field(
    '冲突递进',
    '冲突如何逐步升级并迫使人物做出选择。',
    'Conflict escalation',
    'How conflict intensifies and forces character choices.'
  ),
  cast_lock: field(
    '固定出场人物',
    '本阶段必须出场并承担作用的人物。',
    'Required cast',
    'Characters who must appear and serve a purpose in this stage.'
  ),
  fixed_reveals: field(
    '固定揭示',
    '本阶段必须向人物或读者揭示的信息。',
    'Required reveals',
    'Information that must be revealed in this stage.'
  ),
  chapter_goal: field(
    '本章目标',
    '本章结束前人物行动需要完成的目标。',
    'Chapter goal',
    'What the characters’ actions must accomplish in this chapter.'
  ),
  chapter_conflict: field(
    '本章冲突',
    '阻止本章目标实现的主要对抗或困难。',
    'Chapter conflict',
    'The main opposition or difficulty blocking the chapter goal.'
  ),
  chapter_change: field(
    '本章变化',
    '本章结束时认知、关系或局势必须发生的变化。',
    'Chapter change',
    'The required change in knowledge, relationship, or situation.'
  ),
  ending_hook: field(
    '结尾钩子',
    '让读者愿意继续下一节或下一章的未完成动力。',
    'Ending hook',
    'The unresolved drive that carries the reader into the next section.'
  ),
  invariants: field(
    '不可改变项',
    '本阶段写作中必须始终保持不变的事实。',
    'Invariants',
    'Facts that must remain unchanged throughout this stage.'
  ),
  narrative_function: field(
    '叙事功能',
    '这部分在整体故事中承担的具体作用。',
    'Narrative function',
    'The specific job this content performs in the larger story.'
  ),
  emotional_curve: field(
    '情绪曲线',
    '情绪从开始到结束的变化方向与强度。',
    'Emotional curve',
    'How emotion changes in direction and intensity from start to end.'
  ),
  povs: field(
    '可用视角人物',
    '这一阶段允许承担叙述视角的人物。',
    'Available POV characters',
    'Characters allowed to carry the point of view in this stage.'
  ),
  start_state: field(
    '开始局势',
    '进入本阶段时人物关系和外部局势的状态。',
    'Starting situation',
    'Character relationships and external situation entering this stage.'
  ),
  end_state: field(
    '结束局势',
    '完成本阶段后人物关系和外部局势的状态。',
    'Ending situation',
    'Character relationships and external situation after this stage.'
  ),
  context_pins: field(
    '固定上下文',
    '生成时必须加入、不能被预算淘汰的资料。',
    'Pinned context',
    'Material that must be included in generation context.'
  ),
  context_exclusions: field(
    '排除上下文',
    '生成时明确不应加入的资料。',
    'Excluded context',
    'Material that must not be included in generation context.'
  ),
  related_timeline: field(
    '关联时间线',
    '与当前节点直接相关的时间线事件。',
    'Related timeline',
    'Timeline events directly connected to this node.'
  ),
  related_events: field(
    '关联事件',
    '当前节点需要承接或推动的事件。',
    'Related events',
    'Events this node must continue or advance.'
  ),
  related_foreshadowing: field(
    '关联伏笔',
    '当前节点需要关注的伏笔。',
    'Related foreshadowing',
    'Foreshadowing this node needs to address.'
  ),
  world_entries_used: field(
    '使用的世界设定',
    '当前内容必须遵守或体现的世界书条目。',
    'World entries used',
    'World entries this content must follow or demonstrate.'
  ),
  foreshadowing_planted: field(
    '埋设伏笔',
    '当前内容新埋下的伏笔。',
    'Foreshadowing planted',
    'Foreshadowing newly planted in this content.'
  ),
  foreshadowing_resolved: field(
    '回收伏笔',
    '当前内容解释或兑现的伏笔。',
    'Foreshadowing resolved',
    'Foreshadowing explained or paid off here.'
  ),
  related_patterns: field(
    '写作模式',
    '生成或编辑时需要应用的文风和结构模式。',
    'Writing patterns',
    'Style and structure patterns to apply during generation or editing.'
  ),
  chapter_id: field(
    '所属章',
    '这节或正文所属的章节点。',
    'Chapter',
    'The chapter this scene or prose belongs to.'
  ),
  section: field(
    '所属节点',
    '旧版文档用于记录所属章或场景的字段。',
    'Parent section',
    'Legacy field identifying the parent chapter or scene.'
  ),
  writing_focus: field(
    '本节写作重点',
    '生成本节时必须聚焦的行动、信息或关系变化。',
    'Scene writing focus',
    'The action, information, or relationship change this scene must emphasize.'
  ),
  outline_content: field(
    '节纲',
    '本节的目标、行动、冲突与结束变化。',
    'Scene outline',
    'The goal, action, conflict, and ending change for this scene.'
  ),
  accepted_at: field(
    '接受时间',
    '本节成果被作者接受并写入章正文的时间。',
    'Accepted at',
    'When the author accepted this scene into chapter prose.'
  ),
  purged_at: field(
    '清理时间',
    '章发布后中间生成资料被清理的时间。',
    'Purged at',
    'When intermediate generation material was removed after publication.'
  ),
  chapter_number: field(
    '章序号',
    '面向读者显示的章编号。',
    'Chapter number',
    'The chapter number shown to readers.'
  ),
  volume: field('所属卷', '当前节所在的卷。', 'Volume', 'The volume containing this scene.'),
  act: field(
    '所属幕',
    '当前节所在的幕；没有幕时可以留空。',
    'Act',
    'The act containing this scene; may be blank when no act is used.'
  ),
  pov: field(
    '视角人物',
    '本节通过谁的感知和认知呈现。',
    'POV character',
    'Whose perception and knowledge frame this scene.'
  ),
  world_time: field(
    '世界内时间',
    '本节在故事世界中的具体时间表达。',
    'In-world time',
    'The scene’s exact time within the story world.'
  ),
  chapter_break_hook: field(
    '章间钩子',
    '把本章结尾连接到下一章的推动点。',
    'Chapter-break hook',
    'The drive connecting the end of this chapter to the next.'
  ),
  writing_environment: field(
    '写作环境',
    '本节需要体现的空间、天气、声音或氛围。',
    'Writing environment',
    'Place, weather, sound, and atmosphere to render in this scene.'
  ),
  scene_goal: field(
    '本节目标',
    '人物在本节中试图完成的直接目标。',
    'Scene goal',
    'The immediate objective a character tries to achieve here.'
  ),
  scene_conflict: field(
    '本节冲突',
    '阻碍本节目标实现的对抗或困难。',
    'Scene conflict',
    'The opposition or difficulty blocking the scene goal.'
  ),
  scene_change: field(
    '本节变化',
    '本节结束时必须改变的认知、关系或局势。',
    'Scene change',
    'What must change in knowledge, relationship, or situation.'
  ),
  foreshadowing_reinforced: field(
    '强化伏笔',
    '本节再次提醒或加强的既有伏笔。',
    'Foreshadowing reinforced',
    'Existing foreshadowing reminded or strengthened here.'
  ),
  impact: field(
    '后续影响',
    '本节对人物、关系、局势或后续事件造成的影响。',
    'Consequences',
    'Effects on characters, relationships, situation, or later events.'
  ),
  previous_scene: field(
    '前一节',
    '章内顺序上紧接在前的节。',
    'Previous scene',
    'The immediately preceding scene in this chapter.'
  ),
  scene_ids: field(
    '组成节',
    '已经按顺序写入章正文的节。',
    'Included scenes',
    'Scenes already incorporated into chapter prose in order.'
  ),
  finalized_at: field(
    '定稿时间',
    '章正文被标记为已定稿的时间。',
    'Finalized at',
    'When the chapter prose was marked final.'
  ),
  published_at: field(
    '发布时间',
    '章正文被标记为已发布并锁定的时间。',
    'Published at',
    'When the chapter prose was marked published and locked.'
  ),
  enabled: field(
    '启用',
    '只有启用的卡片才会自动进入提示词和 AI 检查；停用卡片仍保留在项目中。',
    'Enabled',
    'Only enabled cards enter prompts and AI checks automatically; disabled cards remain in the project.'
  ),
  source_refs: field(
    '来源材料',
    '这张卡片从哪些参考材料中提取；只能选择现有参考文档。',
    'Source materials',
    'Reference materials from which this card was derived; choose existing references only.'
  ),
  relations: field(
    '卡片关系',
    '这张卡片与其他现有卡片之间的类型化联系。',
    'Card relations',
    'Typed links between this card and other existing cards.'
  ),
  relation_kind: field(
    '关系类型',
    '说明当前卡片如何影响或解释目标卡片。',
    'Relation type',
    'How this card affects or explains the target card.'
  ),
  target_id: field(
    '目标卡片',
    '关系指向的现有卡片。',
    'Target card',
    'The existing card targeted by this relation.'
  ),
  born_at: field(
    '出生时间',
    '人物出生所对应的时间节点。',
    'Born at',
    'Timeline node when the character was born.'
  ),
  died_at: field(
    '死亡时间',
    '人物死亡所对应的时间节点。',
    'Died at',
    'Timeline node when the character died.'
  ),
  introduced_at: field(
    '首次出场',
    '人物首次进入读者可见故事的时间节点；此前默认不显示。',
    'First appearance',
    'Timeline node when the character first becomes visible to readers.'
  ),
  exited_at: field(
    '退场时间',
    '人物不再参与当前故事的时间节点。',
    'Exit time',
    'Timeline node after which the character no longer participates.'
  ),
  from_character: field(
    '关系发出人物',
    '关系边的起点人物。',
    'Source character',
    'Character at the source end of the relationship.'
  ),
  to_character: field(
    '关系目标人物',
    '关系边的目标人物。',
    'Target character',
    'Character at the target end of the relationship.'
  ),
  relation_type: field(
    '人物关系',
    '亲属、盟友、敌对、上下级等关系名称。',
    'Relationship',
    'The relationship name, such as family, ally, rival, or superior.'
  ),
  direction: field(
    '关系方向',
    '关系是单向认知/作用还是双方共有。',
    'Direction',
    'Whether the relationship is directed or mutual.'
  ),
  starts_at: field(
    '关系开始',
    '这段人物关系开始生效的时间节点。',
    'Starts at',
    'Timeline node where this relationship begins.'
  ),
  ends_at: field(
    '关系结束',
    '这段人物关系停止生效的时间节点；留空表示仍在持续。',
    'Ends at',
    'Timeline node where this relationship ends; blank means ongoing.'
  ),
  visibility: field(
    '知情范围',
    '关系在故事世界中是公开、私下还是秘密。',
    'Visibility',
    'Whether the relationship is public, private, or secret in the story world.'
  ),
  trigger_conditions: field(
    '提醒条件',
    '满足任一条件时提醒作者检查这条伏笔。',
    'Reminder conditions',
    'Conditions that remind the author to review this foreshadowing plan.'
  ),
  reminder_window: field(
    '提醒窗口',
    '伏笔应当埋设、强化或回收的时间范围。',
    'Reminder window',
    'Time range in which the foreshadowing should be planted, reinforced, or resolved.'
  ),
  reminded_at: field(
    '提醒记录',
    '已经向作者显示提醒的时间或节点，避免同一次操作重复提醒。',
    'Reminder history',
    'Times or nodes at which the author was already reminded.'
  ),
  rule_id: field(
    '检查规则',
    '生成这张问题卡的稳定规则标识。',
    'Check rule',
    'Stable rule identifier that generated this issue card.'
  ),
  evidence: field(
    '问题证据',
    'AI 或规则检查发现问题时引用的具体事实与卡片。',
    'Evidence',
    'Specific facts and cards cited by the rule or AI check.'
  ),
  check_fingerprint: field(
    '问题指纹',
    '用于在同一次检查中合并相同问题。',
    'Issue fingerprint',
    'Used to deduplicate the same finding within one check.'
  ),
  legacy_check_fingerprints: field(
    '兼容问题指纹',
    '供旧问题账本兼容匹配的历史指纹别名；作者操作时会按可重建情况惰性迁移。',
    'Legacy issue fingerprints',
    'Historical aliases used for compatible matching and lazily migrated on an author action.'
  ),
  checked_at: field(
    '检查时间',
    '最近一次发现或确认这个问题的时间。',
    'Checked at',
    'When this issue was most recently found or confirmed.'
  ),
  calendar: field(
    '历法',
    '时间节点使用的故事历法名称。',
    'Calendar',
    'Story calendar used by this timeline node.'
  ),
  year: field('年', '时间节点的年份。', 'Year', 'Year represented by this timeline node.'),
  month: field(
    '月',
    '时间节点的起始月份；时间至少要精确到月。',
    'Month',
    'Starting month; timeline time must be precise to at least a month.'
  ),
  month_end: field(
    '结束月',
    '模糊季节或月份范围的结束月份。',
    'End month',
    'Ending month for a fuzzy season or month range.'
  ),
  day: field(
    '日',
    '可选的日期；填写后时间精度至少为日。',
    'Day',
    'Optional day; when present, precision is at least day.'
  ),
  hour: field('时', '可选的小时，使用 0–23。', 'Hour', 'Optional hour from 0 to 23.'),
  minute: field('分', '可选的分钟，使用 0–59。', 'Minute', 'Optional minute from 0 to 59.'),
  precision: field(
    '时间精度',
    '说明该节点精确到月、日、时或分钟。',
    'Time precision',
    'Whether this node is precise to month, day, hour, or minute.'
  ),
  display_time: field(
    '时间写法',
    '向作者显示的原始时间表达，例如“20年秋”。',
    'Display time',
    'Author-facing time expression, such as “Autumn, year 20”.'
  ),
  coordinate_v2: field(
    '结构化时间坐标',
    '保存时间体系、单位分量、精度、排序值与循环次数；通常由时间轴工具管理。',
    'Structured time coordinate',
    'Stores the time system, unit components, precision, ordering, and cycle occurrence; normally managed by the timeline tools.'
  ),
  timeline_tracks: field(
    '时间线轨道位置',
    '记录时间节点属于哪些轨道，以及在各轨道中的展示和叙事顺序。',
    'Timeline track positions',
    'Records the tracks containing this time node and its display and narrative order on each track.'
  ),
  placements: field(
    '事件时间线位置',
    '记录同一事件在一条或多条轨道上的起止节点、顺序和循环次数。',
    'Event timeline placements',
    'Records the start and end nodes, order, and occurrence of one event on one or more tracks.'
  ),
  fuzzy: field(
    '模糊时间',
    '表示该节点覆盖月份范围，而不是一个精确时刻。',
    'Fuzzy time',
    'Whether this node covers a month range rather than one exact instant.'
  ),
  layout_of: field(
    '解释的定位',
    '布局卡所解释的现有定位卡。',
    'Layout of',
    'Existing position card explained by this layout card.'
  ),
  relative_direction: field(
    '相对方位',
    '该定位相对于父地点的方向或位置。',
    'Relative direction',
    'Direction or position relative to the parent location.'
  ),
  floor: field(
    '楼层/高度',
    '室内、建筑或立体空间中的楼层和高度。',
    'Floor / level',
    'Floor or elevation within a building or three-dimensional space.'
  ),
  diagram_nodes: field(
    '简图节点',
    '布局简图中的物体、区域、入口和锚点。',
    'Diagram nodes',
    'Objects, areas, entrances, and anchors in the layout diagram.'
  ),
  diagram_edges: field(
    '简图连线',
    '简图节点之间的通路、相邻或视线关系。',
    'Diagram edges',
    'Paths, adjacency, or sight lines between diagram nodes.'
  ),
  sample: field(
    '风格样例',
    '用于说明叙事卡片的作者片段或已确认示例。',
    'Style sample',
    'Author fragment or approved example illustrating this narrative card.'
  ),
  id: field(
    '节点编号',
    '布局简图或嵌套条目内部使用的稳定编号。',
    'Node ID',
    'Stable identifier used inside a layout diagram or nested entry.'
  ),
  label: field(
    '节点名称',
    '布局简图中向作者显示的物体、区域或锚点名称。',
    'Node name',
    'Author-facing name of an object, area, or anchor in a layout diagram.'
  ),
  x: field(
    '横向位置',
    '节点在布局简图中的横向坐标。',
    'Horizontal position',
    'Horizontal coordinate of the node in the layout diagram.'
  ),
  y: field(
    '纵向位置',
    '节点在布局简图中的纵向坐标。',
    'Vertical position',
    'Vertical coordinate of the node in the layout diagram.'
  ),
  target_location: field(
    '对应地点',
    '该简图节点所链接的现有地点卡片。',
    'Linked location',
    'Existing location card linked from this diagram node.'
  ),
  note: field(
    '关系说明',
    '补充说明两张卡片之间为什么存在这项关系。',
    'Relation note',
    'Optional explanation of why the two cards are related.'
  ),
  keyword: field(
    '触发关键词',
    '正文或规划内容命中该词时触发这项提醒。',
    'Trigger keyword',
    'Word or phrase that activates this reminder when found in prose or planning.'
  ),
  scale: field(
    '空间层级',
    '地点在世界、区域、城市、城区、建筑群或室内层级中的位置。',
    'Spatial scale',
    'Whether the location is world-wide, regional, city-level, district-level, an estate, or an interior.'
  ),
  faction_kind: field(
    '势力类型',
    '势力在世界中属于组织、政府、行会、宗教、军队或家族等哪种形态。',
    'Faction type',
    'Whether this faction is an organization, government, guild, religion, military body, family, or another form.'
  ),
  motto: field('格言', '势力公开或内部使用的格言。', 'Motto', 'The faction’s public or internal motto.'),
  goals: field('目标', '势力持续追求的长期目标。', 'Goals', 'Long-term goals pursued by the faction.'),
  methods: field('手段', '势力通常采用的行动方式。', 'Methods', 'Methods commonly used by the faction.'),
  headquarters: field(
    '总部地点',
    '势力主要据点关联的稳定地点 ID。',
    'Headquarters',
    'Stable location ID for the faction’s primary base.'
  ),
  founded_at: field(
    '成立时间',
    '势力成立所关联的稳定时间节点或事件 ID。',
    'Founded at',
    'Stable timeline node or event ID marking the faction’s founding.'
  ),
  dissolved_at: field(
    '解散时间',
    '势力解散所关联的稳定时间节点或事件 ID。',
    'Dissolved at',
    'Stable timeline node or event ID marking the faction’s dissolution.'
  ),
  from_faction: field(
    '起始势力',
    '势力关系的起始方稳定 ID。',
    'From faction',
    'Stable ID of the source faction in this relationship.'
  ),
  to_faction: field(
    '目标势力',
    '势力关系的目标方稳定 ID。',
    'To faction',
    'Stable ID of the target faction in this relationship.'
  ),
  faction_id: field('所属势力', '成员所属势力的稳定 ID。', 'Faction', 'Stable ID of the faction.'),
  character_id: field('人物', '成员人物的稳定 ID。', 'Character', 'Stable ID of the character.'),
  rank: field('职位/等级', '人物在势力中的职位或等级。', 'Rank', 'The character’s rank within the faction.'),
  primary: field(
    '主要所属',
    '多个势力并存时，标记这是否为人物的主要所属。',
    'Primary membership',
    'Whether this is the character’s primary membership when several coexist.'
  ),
  source_outline: field(
    '来源大纲',
    '导入或迁移时这项内容对应的原大纲。',
    'Source outline',
    'The original outline associated with this imported or migrated record.'
  )
}

const FIELD_OVERRIDES: Record<string, LocalizedFieldDefinition> = {
  'faction_membership.role': field(
    '成员身份',
    '人物在该势力中承担的身份或职责。',
    'Membership role',
    'The character’s role or responsibility in the faction.'
  ),
  'outline.level': field(
    '故事树层级',
    '总览、总纲、卷、篇、幕、章或节在故事树中的位置。',
    'Story-tree level',
    'Whether this node is an overview, book, volume, part, act, chapter, or scene.'
  ),
  'foreshadowing.level': field(
    '伏笔层级',
    'L1 最关键，L5 最轻；用于安排检查和回收优先级。',
    'Foreshadowing level',
    'L1 is most critical and L5 is lightest; used for review and payoff priority.'
  ),
  'character.role': field(
    '人物定位',
    '人物在故事中的身份与主要叙事职责。',
    'Character role',
    'The character’s position and primary narrative responsibility.'
  ),
  'world_entry.role': field(
    '设定作用',
    '决定该条目是硬约束、氛围质感，还是同时承担两者。',
    'World-entry role',
    'Whether the entry is a constraint, texture, or both.'
  ),
  'world_entry.status': field(
    '资料状态',
    '“正设”表示作者认可的权威设定；草稿与已确认表示尚在整理或已经过校对。',
    'Record status',
    'Canon marks an author-approved fact; Draft and Confirmed describe its review stage.'
  ),
  'canon.source': field(
    '正设来源',
    '说明这条权威事实由作者确认、AI 建议、导入或历史资料而来。',
    'Canon source',
    'Whether this authoritative fact came from the author, AI, import, or research.'
  ),
  'world_entry.source': field(
    '资料出处',
    '记录这项世界设定的文档、书目或作者说明。',
    'Reference source',
    'The document, research source, or author note supporting this world entry.'
  ),
  'pattern.source': field(
    '模式来源',
    '说明模式来自作者、AI、已接受正文或导入材料。',
    'Pattern source',
    'Whether the pattern came from the author, AI, accepted prose, or an import.'
  ),
  'narrative.source': field(
    '叙事卡来源',
    '说明这项叙事规则由作者、AI、已接受正文或导入材料归纳而来。',
    'Narrative-card source',
    'Whether this narrative rule came from the author, AI, accepted prose, or an import.'
  ),
  'narrative.category': field(
    '叙事类别',
    '区分文风、结构、节奏、对话、描写和类型边界等用途。',
    'Narrative category',
    'Whether this card governs style, structure, pacing, dialogue, description, or genre boundaries.'
  ),
  'location.kind': field(
    '空间卡类型',
    '定位卡说明地点位于哪里；布局卡说明该地点内部如何排列。',
    'Spatial-card type',
    'A position card locates a place; a layout card describes how that place is arranged internally.'
  ),
  'foreshadowing.kind': field(
    '触发方式',
    '选择到达时间节点、故事节点、命中关键词或启用卡片时触发提醒。',
    'Trigger method',
    'Trigger the reminder when a timeline node or story node is reached, a keyword matches, or a card is enabled.'
  ),
  'pattern.kind': field(
    '模式类型（旧字段）',
    '旧版叙事模式对故事结构、写作风格或提示词的分类。',
    'Pattern type (legacy)',
    'Legacy classification for a story, writing, or prompt pattern.'
  ),
  'timeline_node.previous': field(
    '前一时间节点',
    '时间主链中紧接在当前节点之前的现有时间节点。',
    'Previous timeline node',
    'Existing timeline node immediately before this node in the main chain.'
  ),
  'timeline_node.next': field(
    '后一时间节点',
    '时间主链中紧接在当前节点之后的现有时间节点。',
    'Next timeline node',
    'Existing timeline node immediately after this node in the main chain.'
  ),
  'timeline_event.timeline_node': field(
    '所属时间节点',
    '事件发生的现有时间节点；同一节点可以包含多个同时事件。',
    'Timeline node',
    'Existing timeline node containing this event; multiple concurrent events may share one node.'
  ),
  'character_state.timeline_node': field(
    '状态时间节点',
    '这份人物状态快照生效的现有时间节点。',
    'State timeline node',
    'Existing timeline node at which this character-state snapshot applies.'
  ),
  'chapter_prose.status': field(
    '正文状态',
    '草稿可自由修改；定稿仅允许作者小改；发布后完全锁定。',
    'Prose status',
    'Draft is editable, final allows limited author edits, and published is locked.'
  )
}

export const KNOWN_FIELD_KEYS = Object.freeze(Object.keys(FIELD_DEFINITIONS))

export function fieldPresentation(
  key: string,
  language: LanguageName,
  context: FieldPresentationContext = {}
): FieldPresentation {
  const override = context.documentType ? FIELD_OVERRIDES[context.documentType + '.' + key] : undefined
  const definition = override ?? FIELD_DEFINITIONS[key]
  if (definition) return { ...definition[language], known: true }
  const readable = humanizeFieldKey(key)
  const hasCjk = /[\u3400-\u9fff]/u.test(readable)
  if (language === 'zh') {
    return {
      label: hasCjk ? readable : '自定义属性',
      description: hasCjk
        ? '从导入材料或旧文档保留的附加信息。'
        : '从导入材料或旧文档保留的附加信息；原字段为“' + readable + '”。',
      known: false
    }
  }
  return {
    label: hasCjk ? 'Custom field' : titleCase(readable),
    description: hasCjk
      ? 'Additional information preserved from an import or legacy document; original field: “' +
        readable +
        '”.'
      : 'Additional information preserved from an import or legacy document.',
    known: false
  }
}

export function fieldLabel(
  key: string,
  language: LanguageName = 'zh',
  context: FieldPresentationContext = {}
): string {
  return fieldPresentation(key, language, context).label
}

export function fieldDescription(
  key: string,
  language: LanguageName = 'zh',
  context: FieldPresentationContext = {}
): string {
  return fieldPresentation(key, language, context).description
}

const DEFAULT_ENUM_OPTIONS: Record<string, readonly string[]> = {
  status: ['draft', 'confirmed', 'active', 'inactive', 'deprecated', 'planned', 'resolved'],
  strength: ['hard', 'soft'],
  entry_status: ['candidate', 'active', 'inactive'],
  importance: ['high', 'medium', 'low'],
  state: ['planned', 'planted', 'reinforced', 'resolved', 'abandoned', 'open', 'deferred'],
  material_type: ['book', 'paper', 'article', 'webpage', 'video', 'other'],
  reading_status: ['unread', 'reading', 'read'],
  priority: ['high', 'medium', 'low'],
  category: ['narrative', 'style', 'pacing', 'reader_expectation', 'genre_boundary', 'other'],
  kind: ['story', 'writing', 'prompt'],
  scope: ['book', 'volume', 'part', 'act', 'chapter', 'section', 'agent', 'project'],
  direction: ['directed', 'mutual'],
  faction_kind: ['organization', 'government', 'guild', 'religion', 'military', 'family', 'other'],
  visibility: ['public', 'private', 'secret'],
  precision: ['month', 'day', 'hour', 'minute'],
  scale: ['global', 'region', 'city', 'district', 'estate', 'interior'],
  relation_kind: [
    'related',
    'supports',
    'contradicts',
    'depends_on',
    'located_in',
    'layout_of',
    'involves',
    'triggers',
    'resolves',
    'explains'
  ],
  scope_type: ['timeline_event', 'outline', 'scene']
}

const ENUM_LABELS: Record<string, { zh: string; en: string }> = {
  canon: { zh: '正设', en: 'Canon' },
  draft: { zh: '草稿', en: 'Draft' },
  final: { zh: '已定稿', en: 'Final' },
  published: { zh: '已发布', en: 'Published' },
  confirmed: { zh: '已确认', en: 'Confirmed' },
  active: { zh: '启用', en: 'Active' },
  inactive: { zh: '停用', en: 'Inactive' },
  deprecated: { zh: '已弃用', en: 'Deprecated' },
  planned: { zh: '计划中', en: 'Planned' },
  resolved: { zh: '已解决', en: 'Resolved' },
  hard: { zh: '硬约束', en: 'Hard constraint' },
  soft: { zh: '软约束', en: 'Soft constraint' },
  user: { zh: '作者', en: 'Author' },
  ai: { zh: 'AI', en: 'AI' },
  imported: { zh: '导入', en: 'Imported' },
  historical: { zh: '历史资料', en: 'Historical research' },
  accepted_prose: { zh: '已接受正文', en: 'Accepted prose' },
  created: { zh: '已创建', en: 'Created' },
  generated: { zh: '已生成', en: 'Generated' },
  checked: { zh: '已检查', en: 'Checked' },
  accepted: { zh: '已采纳', en: 'Accepted' },
  pending: { zh: '等待中', en: 'Pending' },
  running: { zh: '进行中', en: 'Running' },
  failed: { zh: '失败', en: 'Failed' },
  supporting: { zh: '辅助人物', en: 'Supporting' },
  constraint: { zh: '规则约束', en: 'Constraint' },
  texture: { zh: '氛围质感', en: 'Texture' },
  both: { zh: '约束与质感', en: 'Both' },
  candidate: { zh: '候选', en: 'Candidate' },
  high: { zh: '高', en: 'High' },
  medium: { zh: '中', en: 'Medium' },
  low: { zh: '低', en: 'Low' },
  planted: { zh: '已埋设', en: 'Planted' },
  reinforced: { zh: '已强化', en: 'Reinforced' },
  abandoned: { zh: '已放弃', en: 'Abandoned' },
  open: { zh: '待处理', en: 'Open' },
  deferred: { zh: '延后', en: 'Deferred' },
  paper: { zh: '论文', en: 'Paper' },
  article: { zh: '文章', en: 'Article' },
  webpage: { zh: '网页', en: 'Webpage' },
  video: { zh: '视频', en: 'Video' },
  other: { zh: '其它', en: 'Other' },
  unread: { zh: '未读', en: 'Unread' },
  reading: { zh: '在读', en: 'Reading' },
  read: { zh: '已读', en: 'Read' },
  narrative: { zh: '叙事', en: 'Narrative' },
  style: { zh: '文风', en: 'Style' },
  pacing: { zh: '节奏', en: 'Pacing' },
  reader_expectation: { zh: '读者预期', en: 'Reader expectation' },
  genre_boundary: { zh: '类型边界', en: 'Genre boundary' },
  story: { zh: '故事结构', en: 'Story' },
  writing: { zh: '写作风格', en: 'Writing' },
  prompt: { zh: '提示词', en: 'Prompt' },
  desire: { zh: '欲望', en: 'Desire' },
  pressure: { zh: '压力', en: 'Pressure' },
  growth: { zh: '成长', en: 'Growth' },
  reveal: { zh: '揭示', en: 'Reveal' },
  relationship: { zh: '关系', en: 'Relationship' },
  structure: { zh: '结构', en: 'Structure' },
  dialogue: { zh: '对话', en: 'Dialogue' },
  description: { zh: '描写', en: 'Description' },
  position: { zh: '定位', en: 'Position' },
  layout: { zh: '布局', en: 'Layout' },
  timeline_reached: { zh: '到达时间节点', en: 'Timeline node reached' },
  outline_reached: { zh: '到达故事节点', en: 'Story node reached' },
  keyword: { zh: '命中关键词', en: 'Keyword matched' },
  card_enabled: { zh: '卡片已启用', en: 'Card enabled' },
  directed: { zh: '单向', en: 'Directed' },
  mutual: { zh: '双向', en: 'Mutual' },
  public: { zh: '公开', en: 'Public' },
  private: { zh: '私下可知', en: 'Private' },
  secret: { zh: '秘密', en: 'Secret' },
  month: { zh: '精确到月', en: 'Month' },
  day: { zh: '精确到日', en: 'Day' },
  hour: { zh: '精确到时', en: 'Hour' },
  minute: { zh: '精确到分', en: 'Minute' },
  global: { zh: '全世界', en: 'Global' },
  region: { zh: '区域', en: 'Region' },
  city: { zh: '城市', en: 'City' },
  district: { zh: '城区/辖区', en: 'District' },
  estate: { zh: '建筑群/庄园', en: 'Estate' },
  interior: { zh: '室内', en: 'Interior' },
  related: { zh: '相关', en: 'Related' },
  supports: { zh: '支持', en: 'Supports' },
  contradicts: { zh: '冲突', en: 'Contradicts' },
  depends_on: { zh: '依赖', en: 'Depends on' },
  located_in: { zh: '位于', en: 'Located in' },
  layout_of: { zh: '布局对应', en: 'Layout of' },
  involves: { zh: '涉及', en: 'Involves' },
  triggers: { zh: '触发', en: 'Triggers' },
  resolves: { zh: '解决/回收', en: 'Resolves' },
  explains: { zh: '解释', en: 'Explains' },
  timeline_event: { zh: '时间线事件', en: 'Timeline event' },
  outline: { zh: '故事节点', en: 'Story node' },
  scene: { zh: '节', en: 'Scene' }
}

const OUTLINE_LEVEL_LABELS: Record<string, { zh: string; en: string }> = {
  overview: { zh: '总览', en: 'Overview' },
  book: { zh: '总纲', en: 'Book outline' },
  volume: { zh: '卷', en: 'Volume' },
  part: { zh: '篇', en: 'Part' },
  arc: { zh: '篇（旧层级）', en: 'Part (legacy arc)' },
  act: { zh: '幕', en: 'Act' },
  chapter: { zh: '章', en: 'Chapter' },
  section: { zh: '节', en: 'Scene' }
}

const SCOPE_LABELS: Record<string, { zh: string; en: string }> = {
  book: { zh: '全书', en: 'Book' },
  volume: { zh: '卷', en: 'Volume' },
  part: { zh: '篇', en: 'Part' },
  arc: { zh: '篇', en: 'Part' },
  act: { zh: '幕', en: 'Act' },
  chapter: { zh: '章', en: 'Chapter' },
  section: { zh: '节', en: 'Scene' },
  scene: { zh: '节', en: 'Scene' },
  agent: { zh: 'AI 助手', en: 'AI agent' },
  project: { zh: '当前项目', en: 'Project' }
}

const MATERIAL_TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  book: { zh: '书籍', en: 'Book' }
}

const DOCUMENT_TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  canon: { zh: '正设', en: 'Canon' },
  character: { zh: '人物', en: 'Character' },
  character_relation: { zh: '人物关系', en: 'Character relationship' },
  faction: { zh: '势力', en: 'Faction' },
  faction_relation: { zh: '势力关系', en: 'Faction relationship' },
  faction_membership: { zh: '势力成员关系', en: 'Faction membership' },
  foreshadowing: { zh: '伏笔', en: 'Foreshadowing' },
  world_entry: { zh: '世界书', en: 'World entry' },
  reference: { zh: '参考材料', en: 'Reference material' },
  issue: { zh: '问题', en: 'Issue' },
  strategy: { zh: '叙事策略（旧类型）', en: 'Narrative strategy (legacy)' },
  pattern: { zh: '叙事模式（旧类型）', en: 'Narrative pattern (legacy)' },
  narrative: { zh: '叙事卡', en: 'Narrative card' },
  character_state: { zh: '人物状态', en: 'Character state' },
  timeline_node: { zh: '时间节点', en: 'Timeline node' },
  timeline_event: { zh: '同时事件', en: 'Concurrent event' },
  location: { zh: '地点/布局', en: 'Location / layout' },
  route: { zh: '路线', en: 'Route' },
  outline: { zh: '故事树节点', en: 'Story-tree node' },
  scene: { zh: '节', en: 'Scene' },
  chapter_prose: { zh: '章正文', en: 'Chapter prose' }
}

export function enumOptionsForField(
  name: string,
  context: FieldPresentationContext = {}
): readonly string[] | undefined {
  if (name === 'level') {
    if (context.documentType === 'outline')
      return ['overview', 'book', 'volume', 'part', 'act', 'chapter', 'section']
    if (context.documentType === 'foreshadowing') return ['L1', 'L2', 'L3', 'L4', 'L5']
    return undefined
  }
  if (name === 'status') {
    if (context.documentType === 'chapter_prose') return ['draft', 'final', 'published']
    if (context.documentType === 'world_entry') return ['canon', 'draft', 'confirmed', 'deprecated']
  }
  if (name === 'faction_kind' && context.documentType === 'faction') {
    return ['organization', 'government', 'guild', 'religion', 'military', 'family', 'other']
  }
  if (name === 'source') {
    if (context.documentType === 'canon') return ['user', 'ai', 'imported', 'historical']
    if (context.documentType === 'pattern' || context.documentType === 'narrative')
      return ['user', 'ai', 'accepted_prose', 'imported']
    return undefined
  }
  if (name === 'role') {
    if (context.documentType === 'world_entry') return ['constraint', 'texture', 'both']
    return undefined
  }
  if (name === 'kind') {
    if (context.documentType === 'location') return ['position', 'layout']
    if (context.documentType === 'foreshadowing')
      return ['timeline_reached', 'outline_reached', 'keyword', 'card_enabled']
    if (context.documentType === 'pattern') return ['story', 'writing', 'prompt']
    return undefined
  }
  if (name === 'category' && context.documentType === 'narrative')
    return ['style', 'structure', 'pacing', 'dialogue', 'description', 'genre_boundary', 'other']
  if (name === 'scope') {
    if (context.documentType === 'narrative')
      return ['book', 'volume', 'part', 'act', 'chapter', 'scene', 'project']
    if (context.documentType === 'pattern')
      return ['book', 'volume', 'arc', 'chapter', 'section', 'agent', 'project']
  }
  return DEFAULT_ENUM_OPTIONS[name]
}

export function enumChoiceLabel(
  name: string,
  value: string,
  language: LanguageName,
  context: FieldPresentationContext = {}
): string {
  if (name === 'level' && context.documentType === 'outline')
    return OUTLINE_LEVEL_LABELS[value]?.[language] ?? humanizeFieldKey(value)
  if (name === 'scope') return SCOPE_LABELS[value]?.[language] ?? humanizeFieldKey(value)
  if (name === 'material_type')
    return (
      MATERIAL_TYPE_LABELS[value]?.[language] ?? ENUM_LABELS[value]?.[language] ?? humanizeFieldKey(value)
    )
  return ENUM_LABELS[value]?.[language] ?? humanizeFieldKey(value)
}

export function outlineLevelDisplayLabel(level: string, language: LanguageName): string {
  return OUTLINE_LEVEL_LABELS[level]?.[language] ?? humanizeFieldKey(level)
}

export function documentTypeLabel(type: string, language: LanguageName): string {
  return (
    DOCUMENT_TYPE_LABELS[type]?.[language] ??
    (language === 'zh' ? '其它卡片' : titleCase(humanizeFieldKey(type)))
  )
}

function humanizeFieldKey(value: string): string {
  return value.replaceAll('_', ' ').replace(/\s+/gu, ' ').trim()
}

function titleCase(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : 'Custom field'
}
