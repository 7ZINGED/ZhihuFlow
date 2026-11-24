import type { AISettings } from '../db';

/**
 * 三阶段提示词的唯一来源（ticket 11）。
 *
 * 本文件只做两件事：把设置解析成确定的配置、把配置拼成消息数组。
 * 不读 chrome.storage、不 fetch、不解析模型响应，因此可以离线测试。
 * 模板文字是从 ai.ts 逐字搬过来的，改动必须同步更新 ai.prompts.snapshot.test.ts 的快照。
 */

export const DEFAULT_TRIAGE_PROMPT = `你是一位敏捷的内容初审与个人知识库专家。请对知乎内容进行【快速粗读初筛】与质量评估：
1. 提炼核心主旨（100字内）与 3 个关键实操/要点；
2. 给出严谨的分拣初筛评级（triageRating）：
   - keep (值得留): 包含高信息密度、硬核实操经验、系统推导逻辑或长线参考价值；
   - discard (可清理): 属于时效短讯、灌水发泄、口水之争、营销引流或空洞泛泛而谈；
   - review (不确定): 内容质量尚可但对个人知识体系价值不明确，建议人工复审；
3. 给出 20 字以内一针见血的分拣评级理由说明。
注意：粗读初筛阶段专注于去粗取精与定级，不打标签、不进行归类，让初筛保持轻量快速。`;

export const DEFAULT_CATEGORIZE_PROMPT = `你是一位专业的个人知识库架构师与词条分类专家。
你的核心任务是建立高收敛、高复用度的分类词条与标签体系，坚决杜绝标签泛滥：
1. 【标签数量极简】：每篇内容【严格限制 1 到 2 个标签】，严禁生成 3 个或更多冗余标签；
2. 【标签池优先复用】：系统会提供当前知识库中已有的常用标签池。请优先从中挑选已有标签进行归并与复用；
3. 【慎创新词】：仅当现有标签完全无法概括核心领域时，才可谨慎建立 1 个高度凝练的行业一级标准分类词条（例如：前端架构、量化金融、认知心理、工作流等），严禁使用口语化、狭义、冗长或近义变体词；
4. 【收藏夹归类】：结合用户现有的备选收藏夹，推荐最匹配的目标归宿（若均不合适填'其他'）。`;

export interface ChatMessage {
  role: string;
  content: string;
}

export interface QuickTriageArticle {
  title: string;
  fullContent?: string;
  authorName?: string;
  voteupCount?: number;
  commentCount?: number;
  collectionTitle?: string;
}

export interface PromptArticle {
  id?: string;
  title: string;
  fullContent?: string;
  aiSummary?: string;
  aiKeyTakeaways?: string[];
  aiCommentsInsight?: string;
  collectionTitle?: string;
}

export interface PromptCollection {
  id: string;
  title: string;
  description?: string;
}

export interface CategorizeOptions {
  existingTags?: string[];
  batchTaxonomy?: string[]; // 两阶段聚类 Pass 1 提炼出的本批次收敛全局规范标签库
  maxTagCount?: number;
  allowModifyDescription?: boolean;
}

export interface BatchCategorizeOptions {
  batchTaxonomy?: string[];
  maxTagCount?: number;
  allowModifyDescription?: boolean;
  existingTags?: string[];
}

export interface TaxonomyOptions {
  maxGlobalTags?: number;
  adaptiveGlobalTags?: boolean;
  customPrompt?: string;
}

export interface TaxonomyConfig {
  maxGlobalTags: number;
  adaptive: boolean;
  customPrompt: string;
}

export interface CategorizeConfig {
  instruction: string;
  existingTags: string[];
  batchTaxonomy: string[];
  maxTagCount: number;
  allowModifyDescription: boolean;
}

export interface BatchCategorizeConfig {
  instruction: string;
  maxTagCount: number;
  allowModifyDescription: boolean;
  batchTaxonomy: string[];
}

/** 粗读的正文测量：截断判定与字数会同时进入提示词和返回结果，因此单独可测。 */
export function measureQuickTriageContent(article: QuickTriageArticle): {
  fullText: string;
  totalWordCount: number;
  isTruncated: boolean;
  contentToSend: string;
} {
  const fullText = (article.fullContent || article.title).trim();
  const totalWordCount = fullText.length;
  const isTruncated = totalWordCount > 3000;
  return { fullText, totalWordCount, isTruncated, contentToSend: fullText.slice(0, 3000) };
}

/** 阶段 1：快速粗读初筛（不打标签、不进行归类，仅初筛定级） */
export function buildQuickTriageMessages(
  article: QuickTriageArticle,
  settings: Pick<AISettings, 'customTriagePrompt'>
): ChatMessage[] {
  const triageInstruction = settings.customTriagePrompt?.trim() || DEFAULT_TRIAGE_PROMPT;
  const { totalWordCount, isTruncated, contentToSend } = measureQuickTriageContent(article);

  const systemPrompt = `你是一位敏捷的内容初审与速读专家。请对知乎内容进行【快速粗读初筛】：
${triageInstruction}`;

  const userPrompt = `【待分析的知乎内容详情】
- 标题/问题：${article.title}
- 答主/作者：${article.authorName || '知乎用户'}
- 互动指标：赞同数 ${article.voteupCount || 0} | 评论数 ${article.commentCount || 0}
- 当前收藏于：${article.collectionTitle || '默认'}
${isTruncated ? `\n⚠️ 【字数截断提示】：正文共 ${totalWordCount} 字，粗读仅截取前 3000 字。\n` : ''}
【正文阅读内容（${isTruncated ? '前 3000 字粗读截选' : `全文共 ${totalWordCount} 字`}）】：
${contentToSend}

请以 JSON 格式严格输出初步分拣筛选结果（禁止使用 markdown 代码块包裹）：
{
  "summary": "100字以内的宏观凝练摘要，直接陈述内容主旨，不要以'本文...'开头",
  "keyTakeaways": ["核心实操/观点要点1", "核心实操/观点要点2", "核心实操/观点要点3"],
  "triageRating": "keep" 或 "discard" 或 "review"（keep表示'值得留'；discard表示'可清理'；review表示'不确定'）,
  "triageReason": "20字以内的粗读初步分拣评级理由说明"
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/** 阶段 2 Pass 1 的配置解析（表达式与搬移前逐字一致） */
export function resolveTaxonomyConfig(
  settings: AISettings,
  options: TaxonomyOptions = {}
): TaxonomyConfig {
  return {
    maxGlobalTags: Math.max(1, options.maxGlobalTags ?? settings.maxGlobalTags ?? 8),
    adaptive: options.adaptiveGlobalTags ?? settings.adaptiveGlobalTags ?? true,
    customPrompt: options.customPrompt ?? settings.customCategorizePrompt ?? '',
  };
}

/** 阶段 2 (Pass 1)：全局主题标签词典提炼 */
export function buildTaxonomyMessages(
  articles: Array<Pick<PromptArticle, 'title' | 'aiSummary' | 'aiKeyTakeaways' | 'aiCommentsInsight'>>,
  config: TaxonomyConfig
): ChatMessage[] {
  const { maxGlobalTags, adaptive, customPrompt } = config;

  // 汇总整批文章的浓缩摘要
  const articleBriefs = articles
    .map((a, idx) => {
      let summary = a.aiCommentsInsight
        ? `${a.aiSummary || ''} (争议焦点: ${a.aiCommentsInsight})`
        : a.aiSummary || (a.aiKeyTakeaways && a.aiKeyTakeaways.length > 0 ? a.aiKeyTakeaways.join('; ') : '无摘要');
      if (!summary || summary === '无摘要') {
        summary = a.title;
      }
      return `${idx + 1}. 《${a.title}》 - 摘要: ${summary.slice(0, 120)}`;
    })
    .join('\n');

  const systemPrompt = `你是一位专业的个人知识库架构师与信息分类学（Taxonomy）专家。
你的任务是根据提供的一批文章的主题与摘要，提炼出一套精炼、高度内聚且互斥的全局主题分类标签体系。
【硬性约束】：
1. 标签总数控制：${adaptive ? `根据这批文章的内容丰富度自适应提炼，但【严格不得超过 ${maxGlobalTags} 个总标签】` : `【严格输出最多 ${maxGlobalTags} 个总标签】`}；
2. 规范性要求：每个标签必须是行业标准的通用主题词条（例如：前端架构、量化交易、产品心理学、认知成长、二次元、职场跃迁等），严禁使用完整句子、狭义冗余词或口语化词汇；
3. 输出格式：仅输出一个 JSON 数组格式的标签列表，严禁代码块包裹。格式示例：["标签1", "标签2", ...]`;

  const userPrompt = `【待提炼全局主题标签体系的文章批次清单（共 ${articles.length} 篇）】：
${articleBriefs}

${customPrompt ? `【用户自定义分类指导要求】：\n${customPrompt}\n` : ''}
请为上述文章批次综合提炼出最核心的全局规范分类标签词库（总数严格限制在 1 ~ ${maxGlobalTags} 个以内）：
["核心标签1", "核心标签2", ...]`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * 单篇分类的配置解析。
 * 注意与批量解析的差异是刻意保留的（搬移前两处表达式不同）：这里用 `|| 2`，
 * 而批量用 `?? 2`。不要把两者合并，否则会改变设置值的行为。
 */
export function resolveCategorizeConfig(
  settings: AISettings,
  options?: string[] | CategorizeOptions
): CategorizeConfig {
  const instruction = settings.customCategorizePrompt?.trim() || DEFAULT_CATEGORIZE_PROMPT;

  let passedExistingTags: string[] = [];
  let batchTaxonomy: string[] = [];
  let maxTagCount = settings.maxTagCount || 2;
  let allowModifyDescription = settings.allowModifyDescription ?? true;

  if (Array.isArray(options)) {
    passedExistingTags = options;
  } else if (options && typeof options === 'object') {
    if (Array.isArray(options.existingTags)) {
      passedExistingTags = options.existingTags;
    }
    if (Array.isArray(options.batchTaxonomy)) {
      batchTaxonomy = options.batchTaxonomy;
    }
    if (typeof options.maxTagCount === 'number') {
      maxTagCount = options.maxTagCount;
    }
    if (typeof options.allowModifyDescription === 'boolean') {
      allowModifyDescription = options.allowModifyDescription;
    }
  }

  // 保证 maxTagCount 合法 (1 ~ 5)
  maxTagCount = Math.max(1, Math.min(5, maxTagCount));

  return {
    instruction,
    existingTags: passedExistingTags,
    batchTaxonomy,
    maxTagCount,
    allowModifyDescription,
  };
}

/** 阶段 2：单篇词条分类与标签提取 */
export function buildCategorizeMessages(
  article: Pick<PromptArticle, 'title' | 'fullContent' | 'aiSummary'>,
  targetCollections: PromptCollection[],
  config: CategorizeConfig
): ChatMessage[] {
  const { instruction, existingTags, batchTaxonomy, maxTagCount, allowModifyDescription } = config;

  const collectionsDesc = targetCollections
    .map((c) => `- 「${c.title}」: ${c.description || '无具体说明'}`)
    .join('\n');

  // 取出现有高频标签池前 30 个供 AI 优先匹配
  const cleanExistingTags = Array.from(
    new Set(existingTags.filter((t) => typeof t === 'string' && t.trim()))
  ).slice(0, 30);

  const hasBatchTaxonomy = batchTaxonomy.length > 0;

  const systemPrompt = `你是一位专业的个人知识库架构师与词条分类专家。
${instruction}

【硬性约束】：
1. 标签数量控制：每篇内容【严格输出最多 ${maxTagCount} 个标签】（1 到 ${maxTagCount} 个，多余的坚决不生成）；
${hasBatchTaxonomy
  ? `2. 【全局标签库强制对齐】：本批次已通过全局语义聚类提炼出以下规范词库，请【严格优先且仅能从中选取】最匹配本文的标签：${batchTaxonomy.join('、')}；坚决杜绝创造生僻冗余新词；`
  : '2. 标签池优先复用：系统会提供现有高频标签池，请优先从中挑选已有标签进行归并与复用；'}
${allowModifyDescription ? '3. 描述提炼：请结合正文生成 80 字以内的精简摘要描述（summary 字段）；' : '3. 描述保持：本次无需修改摘要描述；'}
4. 收藏夹归类：结合备选收藏夹推荐最贴切归宿。`;

  const safeTitle = article.title || '知乎内容';
  const safeSummary = article.aiSummary || '（暂无粗读摘要）';
  const safeContent = (article.fullContent || safeTitle || '').slice(0, 1500);

  const userPrompt = `【待分类的知乎内容】
- 标题：${safeTitle}
- 现有摘要：${safeSummary}
- 正文参考截选：${safeContent}

${hasBatchTaxonomy ? `【本批次收敛全局标签库（请严格从下列选项中挑选 1~${maxTagCount} 个）】：\n${batchTaxonomy.join('、')}\n` : `【知识库现有高频标签池（请严格优先从中挑选最匹配的，严禁制造同义冗余新词）】：\n${cleanExistingTags.length > 0 ? cleanExistingTags.join('、') : '（当前标签库暂为空，请按行业一级标准建立初始词条）'}\n`}
【用户备选收藏夹清单】：
${collectionsDesc || '（暂无其他收藏夹）'}

请以 JSON 格式输出词条分类结果（严禁代码块包裹）：
{
  "tags": [${Array.from({ length: maxTagCount }, (_, i) => `"核心标签${i + 1}"`).join(', ')}],
  "recommendedCategory": "备选收藏夹列表中最匹配的完整标题（若均不合适填'其他'）",
  "categorizeReason": "20字以内的归类推荐理由"${allowModifyDescription ? ',\n  "summary": "80字以内的文章精炼主旨描述"' : ''}
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/** 阶段 2 Pass 2 的配置解析（表达式与搬移前逐字一致） */
export function resolveBatchCategorizeConfig(
  settings: AISettings,
  options: BatchCategorizeOptions = {}
): BatchCategorizeConfig {
  return {
    instruction: settings.customCategorizePrompt?.trim() || DEFAULT_CATEGORIZE_PROMPT,
    maxTagCount: Math.max(1, Math.min(5, options.maxTagCount ?? settings.maxTagCount ?? 2)),
    allowModifyDescription: options.allowModifyDescription ?? settings.allowModifyDescription ?? true,
    batchTaxonomy: options.batchTaxonomy && options.batchTaxonomy.length > 0 ? options.batchTaxonomy : [],
  };
}

/** 阶段 2 (Pass 2)：整批单次批量打标映射 */
export function buildBatchCategorizeMessages(
  articles: PromptArticle[],
  targetCollections: PromptCollection[],
  config: BatchCategorizeConfig
): ChatMessage[] {
  const { instruction, maxTagCount, allowModifyDescription, batchTaxonomy } = config;

  const collectionsDesc = targetCollections
    .map((c) => `- 「${c.title}」: ${c.description || '无具体说明'}`)
    .join('\n');

  // 构建待分类的文章清单（每篇标注唯一编号与 ID，附带标题与浓缩要点）
  const articleListText = articles
    .map((a, idx) => {
      let summary = a.aiCommentsInsight
        ? `${a.aiSummary || ''} (热评洞察: ${a.aiCommentsInsight})`
        : a.aiSummary || (a.aiKeyTakeaways?.length ? a.aiKeyTakeaways.join('; ') : (a.fullContent || a.title).slice(0, 300));
      if (!summary) summary = '无详细摘要';
      return `[条目 ${idx + 1}] ID: ${a.id}
- 标题: ${a.title}
- 现有摘要/内容要点: ${summary.slice(0, 160)}
- 当前所在收藏夹: ${a.collectionTitle || '默认'}`;
    })
    .join('\n\n');

  const systemPrompt = `你是一位专业的个人知识库架构师与词条分类专家。
${instruction}

【硬性约束】：
1. 一次性批量映射：请一次性处理提供的所有文章，严禁遗漏任何一条目；
2. 标签强制收敛：每篇文章【严格输出最多 ${maxTagCount} 个标签】（1 到 ${maxTagCount} 个），必须【严格且仅从以下收敛标签词库中选取】最匹配的标签：
   ${batchTaxonomy.length > 0 ? batchTaxonomy.join('、') : '（请按行业一级标准建立初始词条）'}
   坚决杜绝创造生僻、冗余新词；
3. 推荐收藏夹：结合备选收藏夹清单，为每篇文章推荐最贴切的收藏夹名称（若均不合适填'其他'）；
${allowModifyDescription ? '4. 描述主旨：为每篇文章提炼 60 字以内的精炼描述（summary 字段）；' : '4. 描述保持：本次无需生成 summary 描述；'}
5. 输出格式：必须输出一个完整的 JSON 数组，严禁使用 markdown 代码块包裹，每个对象必须包含 id 字段。`;

  const userPrompt = `【本批次全局收敛标签词库（强制仅从中挑选 1~${maxTagCount} 个标签）】：
${batchTaxonomy.length > 0 ? batchTaxonomy.join('、') : '（通用标准词条）'}

【用户备选收藏夹清单】：
${collectionsDesc || '（暂无其他收藏夹）'}

【本批次待分类文章清单（共 ${articles.length} 篇）】：
${articleListText}

请直接输出 JSON 数组格式（严禁代码块包裹）：
[
  {
    "id": "对应条目的ID",
    "tags": [${Array.from({ length: maxTagCount }, (_, i) => `"核心标签${i + 1}"`).join(', ')}],
    "recommendedCategory": "备选收藏夹名称",
    "categorizeReason": "20字以内推荐理由"${allowModifyDescription ? ',\n    "summary": "60字以内主旨描述"' : ''}
  }
]`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/** 精读的正文与热评测量。精读不截断全文，也没有任何设置相关的变量。 */
export function measureDeepReadContent(
  article: Pick<QuickTriageArticle, 'title' | 'fullContent'>,
  hotComments: string[]
): { fullText: string; totalWordCount: number; commentsText: string } {
  const fullText = (article.fullContent || article.title).trim();
  return {
    fullText,
    totalWordCount: fullText.length,
    commentsText:
      hotComments.length > 0
        ? hotComments.map((c, i) => `${i + 1}. ${c}`).join('\n')
        : '（暂无热评或未开启评论区）',
  };
}

/** 阶段 3：全文深度精读（无字数截断限制 + 热评 Top 5） */
export function buildDeepReadMessages(
  article: QuickTriageArticle,
  hotComments: string[] = []
): ChatMessage[] {
  const { fullText, totalWordCount, commentsText } = measureDeepReadContent(article, hotComments);

  const systemPrompt = `你是一位严谨的深度内容精读与个人知识库专家。你的任务是对知乎内容进行【全文深度精读】（通读完整长文本全文，无字数截断限制；并深度结合评论区高赞热评/神评反馈）。
提炼全景核心论证、实践踩坑点，深度分析评论区的反驳与关键补充。`;

  const userPrompt = `【待深度精读的知乎内容详情】
- 标题/问题：${article.title}
- 答主/作者：${article.authorName || '知乎用户'}
- 互动指标：赞同数 ${article.voteupCount || 0} | 评论数 ${article.commentCount || 0}
- 当前收藏于：${article.collectionTitle || '默认'}

【完整正文全文（全文无限制阅读，共 ${totalWordCount} 字）】：
${fullText}

【评论区高赞热评 / 神评 Top 5】：
${commentsText}

请以 JSON 格式严格输出你的深度精读分析结果（禁止使用 markdown 代码块包裹）：
{
  "summary": "140字以内的全景深度摘要，直接提炼文章核心论点、推导脉络与方案精髓",
  "keyTakeaways": ["深度实操/核心要点1", "深度实操/核心要点2", "深度实操/核心要点3"],
  "commentsInsight": "45字以内的评论区高赞焦点、关键争议或实践补充（若热评无实质内容则写'暂无关键争议补充'）"
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/** 为某个收藏夹的内容生成 50 字精炼简介 */
export function buildCollectionDescriptionMessages(
  articles: Array<Pick<PromptArticle, 'title' | 'fullContent'>>
): ChatMessage[] {
  const articleText = articles
    .slice(0, 15)
    .map((a) => `- 标题: ${a.title}\n  正文摘要: ${(a.fullContent || '').slice(0, 200).replace(/\s+/g, ' ')}...`)
    .join('\n\n');

  const prompt = `根据以下来自知乎收藏夹的文章标题和正文摘要，为这个收藏夹生成一段话精炼的宏观描述。
不要列举介绍各篇文章的具体主题，宏观一点。介绍是给自己看的，直接介绍，开头不要诸如"本收藏夹……"，不要诸如"特别适合xxx的人"的话，字数严格控制在50字以内，不要在最后输出字数统计。

文章列表：
${articleText}

请直接生成描述：`;

  return [
    { role: 'system', content: '你是一位专业的知识库管理员和内容分析专家。' },
    { role: 'user', content: prompt },
  ];
}
