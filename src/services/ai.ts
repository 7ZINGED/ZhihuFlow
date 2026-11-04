import { type AISettings } from '../db';

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

export const DEFAULT_AI_SETTINGS: AISettings = {
  endpoint: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
  customTriagePrompt: DEFAULT_TRIAGE_PROMPT,
  customCategorizePrompt: DEFAULT_CATEGORIZE_PROMPT,
  maxTagCount: 2,
  allowModifyTags: true,
  allowModifyDescription: true,
};

export async function getAISettings(): Promise<AISettings> {
  const result = await chrome.storage.local.get(['ai_settings']);
  return {
    ...DEFAULT_AI_SETTINGS,
    ...(result.ai_settings || {}),
  };
}

export async function saveAISettings(settings: AISettings): Promise<void> {
  await chrome.storage.local.set({ ai_settings: settings });
}

export function normalizeEndpoint(url: string): string {
  const clean = url.trim().replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) {
    return clean;
  }
  return `${clean}/chat/completions`;
}

async function callChatCompletions(
  messages: { role: string; content: string }[],
  temperature = 0.3
): Promise<string> {
  const settings = await getAISettings();
  if (!settings.endpoint || !settings.model) {
    throw new Error('未配置 AI 接口或模型名称，请前往右上角「设置」面板配置！');
  }

  const endpointUrl = normalizeEndpoint(settings.endpoint);

  // 若为商业远程模型服务且未填写 API Key，直接友好拦截提醒，避免盲目发送401
  const isLocal = endpointUrl.includes('127.0.0.1') || endpointUrl.includes('localhost') || endpointUrl.includes(':11434');
  if (!isLocal && !settings.apiKey?.trim()) {
    throw new Error('当前大模型接口需要 API Key，请先前往右上角「设置」面板填写 API Key！');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (settings.apiKey) {
    headers['Authorization'] = `Bearer ${settings.apiKey.trim()}`;
  }

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model.trim(),
      messages,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI 请求失败 [${response.status}]: ${errorText}`);
  }

  const json = await response.json();
  const rawText = json.choices?.[0]?.message?.content?.trim() || '';
  return rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
}

// -------------------------------------------------------------
// 阶段 1：快速粗读初筛（不打标签、不进行归类，仅初筛定级）
// -------------------------------------------------------------
export interface QuickTriageResult {
  summary: string;
  keyTakeaways: string[];
  triageRating: 'keep' | 'discard' | 'review';
  triageReason: string;
  isTruncated: boolean;
  totalWordCount: number;
  readingMode: 'quick';
}

export async function quickTriageArticleWithAI(article: {
  title: string;
  fullContent?: string;
  authorName?: string;
  voteupCount?: number;
  commentCount?: number;
  collectionTitle?: string;
}): Promise<QuickTriageResult> {
  const settings = await getAISettings();
  const triageInstruction = settings.customTriagePrompt?.trim() || DEFAULT_TRIAGE_PROMPT;

  const fullText = (article.fullContent || article.title).trim();
  const totalWordCount = fullText.length;
  const isTruncated = totalWordCount > 3000;
  const contentToSend = fullText.slice(0, 3000);

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

  const rawJson = await callChatCompletions([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  try {
    const parsed = JSON.parse(rawJson);
    return {
      summary: parsed.summary || '暂无摘要',
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      triageRating: ['keep', 'discard', 'review'].includes(parsed.triageRating)
        ? parsed.triageRating
        : 'review',
      triageReason: parsed.triageReason || 'AI已完成粗读初筛',
      isTruncated,
      totalWordCount,
      readingMode: 'quick',
    };
  } catch (err) {
    return {
      summary: rawJson.slice(0, 150),
      keyTakeaways: [],
      triageRating: 'review',
      triageReason: '解析初步筛选结果异常',
      isTruncated,
      totalWordCount,
      readingMode: 'quick',
    };
  }
}

// -------------------------------------------------------------
// 阶段 2：词条分类与标签提取（严格限制1~2个收敛标签，优先复用标签池）
// -------------------------------------------------------------
export interface CategorizeResult {
  tags: string[]; // 严格 1 ~ maxTagCount 个规范标签
  recommendedCategory: string;
  categorizeReason?: string;
  summary?: string; // AI 生成/提炼的简明描述 (受“描述开关”控制)
}

export interface CategorizeOptions {
  existingTags?: string[];
  maxTagCount?: number;
  allowModifyDescription?: boolean;
}

export async function categorizeArticleWithAI(
  article: {
    title: string;
    fullContent?: string;
    aiSummary?: string;
    collectionTitle?: string;
  },
  targetCollections: { id: string; title: string; description?: string }[],
  options?: string[] | CategorizeOptions
): Promise<CategorizeResult> {
  const settings = await getAISettings();
  const categorizeInstruction = settings.customCategorizePrompt?.trim() || DEFAULT_CATEGORIZE_PROMPT;

  let passedExistingTags: string[] = [];
  let maxTagCount = settings.maxTagCount || 2;
  let allowModifyDescription = settings.allowModifyDescription ?? true;

  if (Array.isArray(options)) {
    passedExistingTags = options;
  } else if (options && typeof options === 'object') {
    if (Array.isArray(options.existingTags)) {
      passedExistingTags = options.existingTags;
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

  const collectionsDesc = targetCollections
    .map((c) => `- 「${c.title}」: ${c.description || '无具体说明'}`)
    .join('\n');

  // 取出现有高频标签池前 30 个供 AI 优先匹配
  const cleanExistingTags = Array.from(
    new Set(passedExistingTags.filter((t) => typeof t === 'string' && t.trim()))
  ).slice(0, 30);

  const systemPrompt = `你是一位专业的个人知识库架构师与词条分类专家。
${categorizeInstruction}

【硬性约束】：
1. 标签数量控制：每篇内容【严格输出最多 ${maxTagCount} 个标签】（1 到 ${maxTagCount} 个，多余的坚决不生成）；
2. 标签池优先复用：系统会提供现有高频标签池，请优先从中挑选已有标签进行归并与复用；
${allowModifyDescription ? '3. 描述提炼：请结合正文生成 80 字以内的精简摘要描述（summary 字段）；' : '3. 描述保持：本次无需修改摘要描述；'}
4. 收藏夹归类：结合备选收藏夹推荐最贴切归宿。`;

  const safeTitle = article.title || '知乎内容';
  const safeSummary = article.aiSummary || '（暂无粗读摘要）';
  const safeContent = (article.fullContent || safeTitle || '').slice(0, 1500);

  const userPrompt = `【待分类的知乎内容】
- 标题：${safeTitle}
- 现有摘要：${safeSummary}
- 正文参考截选：${safeContent}

【知识库现有高频标签池（请严格优先从中挑选最匹配的，严禁制造同义冗余新词）】：
${cleanExistingTags.length > 0 ? cleanExistingTags.join('、') : '（当前标签库暂为空，请按行业一级标准建立初始词条）'}

【用户备选收藏夹清单】：
${collectionsDesc || '（暂无其他收藏夹）'}

请以 JSON 格式输出词条分类结果（严禁代码块包裹）：
{
  "tags": [${Array.from({ length: maxTagCount }, (_, i) => `"核心标签${i + 1}"`).join(', ')}],
  "recommendedCategory": "备选收藏夹列表中最匹配的完整标题（若均不合适填'其他'）",
  "categorizeReason": "20字以内的归类推荐理由"${allowModifyDescription ? ',\n  "summary": "80字以内的文章精炼主旨描述"' : ''}
}`;

  const rawJson = await callChatCompletions([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  try {
    const parsed = JSON.parse(rawJson);
    const rawTags: string[] = Array.isArray(parsed.tags) ? parsed.tags : [];
    // 严格限制为 1 ~ maxTagCount 个规范标签，过滤无效空值与符号
    const cleanTags = rawTags
      .map((t) => String(t).trim().replace(/^#+/, ''))
      .filter((t) => t.length > 0 && t.length <= 15)
      .slice(0, maxTagCount);

    return {
      tags: cleanTags.length > 0 ? cleanTags : ['未归类'],
      recommendedCategory: parsed.recommendedCategory || '默认',
      categorizeReason: parsed.categorizeReason || 'AI已完成分类匹配',
      summary: allowModifyDescription ? parsed.summary?.trim() : undefined,
    };
  } catch (err) {
    return {
      tags: ['未归类'],
      recommendedCategory: '默认',
      categorizeReason: '解析词条分类结果异常',
    };
  }
}

// -------------------------------------------------------------
// 阶段 3：全文深度精读（无字数截断限制 + 抓取热评Top5争议与实操深度洞察）
// -------------------------------------------------------------
export interface DeepReadResult {
  summary: string;
  keyTakeaways: string[];
  commentsInsight: string;
  hotComments: string[];
  readingMode: 'deep';
  isTruncated: false;
  totalWordCount?: number;
}

export async function deepReadArticleWithAI(
  article: {
    title: string;
    fullContent?: string;
    authorName?: string;
    voteupCount?: number;
    commentCount?: number;
    collectionTitle?: string;
  },
  hotComments: string[] = []
): Promise<DeepReadResult> {
  const fullText = (article.fullContent || article.title).trim();
  const totalWordCount = fullText.length;

  const commentsText = hotComments.length > 0
    ? hotComments.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '（暂无热评或未开启评论区）';

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

  const rawJson = await callChatCompletions([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  try {
    const parsed = JSON.parse(rawJson);
    return {
      summary: parsed.summary || '暂无深度精读摘要',
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      commentsInsight: parsed.commentsInsight || '暂无关键争议补充',
      hotComments,
      readingMode: 'deep',
      isTruncated: false,
    };
  } catch (err) {
    return {
      summary: rawJson.slice(0, 180),
      keyTakeaways: [],
      commentsInsight: '深度解析异常',
      hotComments,
      readingMode: 'deep',
      isTruncated: false,
    };
  }
}

// -------------------------------------------------------------
// 通用多模式分析入口（兼容 AutoOrganizeModal 与历史调用）
// -------------------------------------------------------------
export interface AnalyzeOptions {
  mode?: 'quick' | 'categorize' | 'deep';
  hotComments?: string[];
  existingTags?: string[];
}

export interface AIAnalysisResult {
  summary: string;
  keyTakeaways: string[];
  recommendedCategory: string;
  triageRating: 'keep' | 'discard' | 'review';
  triageReason: string;
  tags?: string[];
  commentsInsight?: string;
  isTruncated: boolean;
  totalWordCount: number;
  readingMode: 'quick' | 'deep';
}

export async function analyzeArticleWithAI(
  article: {
    title: string;
    fullContent?: string;
    authorName?: string;
    voteupCount?: number;
    commentCount?: number;
    collectionTitle?: string;
    aiSummary?: string;
  },
  targetCollections: { id: string; title: string; description?: string }[] = [],
  options: AnalyzeOptions = {}
): Promise<AIAnalysisResult> {
  const mode = options.mode || 'quick';

  if (mode === 'categorize') {
    const catRes = await categorizeArticleWithAI(
      article,
      targetCollections,
      options.existingTags || []
    );
    return {
      summary: article.aiSummary || '',
      keyTakeaways: [],
      recommendedCategory: catRes.recommendedCategory,
      triageRating: 'review',
      triageReason: catRes.categorizeReason || '',
      tags: catRes.tags,
      isTruncated: false,
      totalWordCount: (article.fullContent || article.title).length,
      readingMode: 'quick',
    };
  }

  if (mode === 'deep') {
    const deepRes = await deepReadArticleWithAI(article, options.hotComments || []);
    return {
      summary: deepRes.summary,
      keyTakeaways: deepRes.keyTakeaways,
      recommendedCategory: '',
      triageRating: 'keep',
      triageReason: '深度精读已完成',
      commentsInsight: deepRes.commentsInsight,
      isTruncated: false,
      totalWordCount: (article.fullContent || article.title).length,
      readingMode: 'deep',
    };
  }

  // 默认：快速粗读初筛（不打标签）
  const quickRes = await quickTriageArticleWithAI(article);
  return {
    summary: quickRes.summary,
    keyTakeaways: quickRes.keyTakeaways,
    recommendedCategory: '',
    triageRating: quickRes.triageRating,
    triageReason: quickRes.triageReason,
    isTruncated: quickRes.isTruncated,
    totalWordCount: quickRes.totalWordCount,
    readingMode: 'quick',
  };
}

/**
 * 为某个收藏夹的内容生成 50 字精炼简介
 */
export async function generateCollectionDescription(
  articles: { title: string; fullContent?: string }[]
): Promise<string> {
  const articleText = articles
    .slice(0, 15)
    .map((a) => `- 标题: ${a.title}\n  正文摘要: ${(a.fullContent || '').slice(0, 200).replace(/\s+/g, ' ')}...`)
    .join('\n\n');

  const prompt = `根据以下来自知乎收藏夹的文章标题和正文摘要，为这个收藏夹生成一段话精炼的宏观描述。
不要列举介绍各篇文章的具体主题，宏观一点。介绍是给自己看的，直接介绍，开头不要诸如"本收藏夹……"，不要诸如"特别适合xxx的人"的话，字数严格控制在50字以内，不要在最后输出字数统计。

文章列表：
${articleText}

请直接生成描述：`;

  return await callChatCompletions([
    { role: 'system', content: '你是一位专业的知识库管理员和内容分析专家。' },
    { role: 'user', content: prompt },
  ], 0.7);
}
