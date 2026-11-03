import { type AISettings } from '../db';

export const DEFAULT_TRIAGE_PROMPT = `你是一位敏锐的内容初审与个人知识库专家。请对知乎内容进行分拣筛选与质量评估：
1. 提炼核心主旨（100字内）与 3 个关键实操/要点；
2. 给出严谨的分拣评级（triageRating）：
   - keep (值得留): 包含高信息密度、硬核实操经验、系统推导逻辑或长线参考价值；
   - discard (可清理): 属于时效短讯、灌水发泄、口水之争、营销引流或空洞泛泛而谈；
   - review (不确定): 内容质量尚可但对个人知识体系价值不明确，建议人工复审；
3. 给出 25 字以内一针见血的分拣评级理由说明。`;

export const DEFAULT_CATEGORIZE_PROMPT = `你是一位专业的分类归档与词条分类专家。
你的任务是深入理解内容的知识图谱与核心领域：
1. 提取 2~4 个规范化、具象化的专业标签词条（例如：技术架构、产品思维、深度学习、生活技巧等，禁止提取无意义泛词）；
2. 结合给定的备选收藏夹列表，推荐最合适的目标归宿；若无合适归属请返回「其他」。`;

export const DEFAULT_AI_SETTINGS: AISettings = {
  endpoint: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
  customTriagePrompt: DEFAULT_TRIAGE_PROMPT,
  customCategorizePrompt: DEFAULT_CATEGORIZE_PROMPT,
};

export async function getAISettings(): Promise<AISettings> {
  const result = await chrome.storage.local.get(['ai_settings']);
  return result.ai_settings || DEFAULT_AI_SETTINGS;
}

export async function saveAISettings(settings: AISettings): Promise<void> {
  await chrome.storage.local.set({ ai_settings: settings });
}

export interface AnalyzeOptions {
  mode?: 'quick' | 'deep'; // 'quick': 粗读 (正文3000字截断，不读评论) | 'deep': 深读 (全文无限制+热评Top5)
  hotComments?: string[];
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

/**
 * 格式化并补全 OpenAI 兼容的 chat/completions URL
 */
export function normalizeEndpoint(url: string): string {
  const clean = url.trim().replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) {
    return clean;
  }
  return `${clean}/chat/completions`;
}

/**
 * 调用通用 OpenAI 兼容接口，为单篇文章生成 MoonDigest 风格的双层摘读体系
 * 1. 粗读 (quick): 限制正文前 3000 字，仅读正文不读评论；若全文超 3000 字标记截断警示
 * 2. 深读 (deep): 全文不限字数长文本 + 抓取评论区高赞热评 Top 5 深度归纳
 */
export async function analyzeArticleWithAI(
  article: {
    title: string;
    fullContent?: string;
    authorName?: string;
    voteupCount?: number;
    commentCount?: number;
    collectionTitle?: string;
  },
  targetCollections: { id: string; title: string; description?: string }[],
  options: AnalyzeOptions = {}
): Promise<AIAnalysisResult> {
  const settings = await getAISettings();
  if (!settings.endpoint || !settings.model) {
    throw new Error('未配置 AI 接口或模型名称，请前往设置面板配置！');
  }

  const endpointUrl = normalizeEndpoint(settings.endpoint);
  const mode = options.mode || 'quick';

  const collectionsDesc = targetCollections
    .map((c) => `- 「${c.title}」: ${c.description || '无具体说明'}`)
    .join('\n');

  // 计算全文总字数与截断判断
  const fullText = (article.fullContent || article.title).trim();
  const totalWordCount = fullText.length;
  const isTruncated = mode === 'quick' && totalWordCount > 3000;

  // 粗读限制前 3000 字；深读不限字数通读全文
  const contentToSend = mode === 'quick' ? fullText.slice(0, 3000) : fullText;

  // 粗读模式只读正文（不附带评论）；深读模式才包含评论区 Top 5
  const hotComments = mode === 'deep' ? (options.hotComments || []) : [];
  const commentsText = hotComments.length > 0
    ? hotComments.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '（暂无热评或未开启评论区）';

  // 提取用户自定义提示词（或默认提示词）
  const triageInstruction = settings.customTriagePrompt?.trim() || DEFAULT_TRIAGE_PROMPT;
  const categorizeInstruction = settings.customCategorizePrompt?.trim() || DEFAULT_CATEGORIZE_PROMPT;

  // 构建 Prompt
  let systemPrompt = '';
  let userPrompt = '';

  const modeInstruction = mode === 'deep'
    ? '【当前阅读模式】：全文深度精读（通读全文无字数截断限制，并深度结合评论区高赞热评/神评反馈，提炼全景核心论证、实践踩坑点与争议补充）'
    : '【当前阅读模式】：快速粗读（通读正文前 3000 字，不读评论，快速提炼核心要点与初步分拣印象）';

  systemPrompt = `${modeInstruction}

【分拣初筛与评级准则】：
${triageInstruction}

【词条分类与标签提取准则】：
${categorizeInstruction}`;

  if (mode === 'quick') {
    userPrompt = `【待分析的知乎内容详情】
- 标题/问题：${article.title}
- 答主/作者：${article.authorName || '知乎用户'}
- 互动指标：赞同数 ${article.voteupCount || 0} | 评论数 ${article.commentCount || 0}
- 当前收藏于：${article.collectionTitle || '默认'}
${isTruncated ? `\n⚠️ 【字数截断提示】：正文共 ${totalWordCount} 字，粗读仅截取前 3000 字。\n` : ''}
【正文阅读内容（${isTruncated ? '前 3000 字粗读截选' : `全文共 ${totalWordCount} 字`}）】：
${contentToSend}

【备选收藏夹清单】：
${collectionsDesc || '（暂无其他收藏夹）'}

请严格按照系统设定的分拣筛选与词条分类标准，以 JSON 格式输出分析结果（禁止使用 markdown 代码块包裹）：
{
  "summary": "100字以内的宏观凝练摘要，直接陈述内容主旨，不要以'本文...'开头",
  "keyTakeaways": ["核心实操/观点要点1", "核心实操/观点要点2", "核心实操/观点要点3"],
  "tags": ["核心主题标签1", "标签2"],
  "recommendedCategory": "从备选收藏夹列表中挑选最合适的目标收藏夹完整标题（若均不合适填'其他'）",
  "triageRating": "keep" 或 "discard" 或 "review",
  "triageReason": "20字以内的粗读初步分拣评级理由说明"
}`;
  } else {
    // 深度精读模式 (全文不限字数 + 热评 Top 5)
    userPrompt = `【待分析的知乎内容详情】
- 标题/问题：${article.title}
- 答主/作者：${article.authorName || '知乎用户'}
- 互动指标：赞同数 ${article.voteupCount || 0} | 评论数 ${article.commentCount || 0}
- 当前收藏于：${article.collectionTitle || '默认'}

【完整正文全文（全文无限制阅读，共 ${totalWordCount} 字）】：
${contentToSend}

【评论区高赞热评 / 神评 Top 5】：
${commentsText}

【备选收藏夹清单】：
${collectionsDesc || '（暂无其他收藏夹）'}

请严格按照系统设定的深度精读、分拣筛选与词条分类标准，以 JSON 格式输出分析结果（禁止使用 markdown 代码块包裹）：
{
  "summary": "140字以内的全景深度摘要，直接提炼文章核心论点、推导脉络与方案精髓",
  "keyTakeaways": ["深度实操/核心要点1", "深度实操/核心要点2", "深度实操/核心要点3"],
  "commentsInsight": "45字以内的评论区高赞焦点、关键争议或实践补充（若热评无实质内容则写'暂无关键争议补充'）",
  "tags": ["核心主题标签1", "标签2"],
  "recommendedCategory": "从备选收藏夹列表中挑选最合适的目标收藏夹完整标题（若均不合适填'其他'）",
  "triageRating": "keep" 或 "discard" 或 "review",
  "triageReason": "结合全文深度干货度、赞同量及热评反馈给出的25字以内深度分拣评级理由"
}`;
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
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI 请求失败 [${response.status}]: ${errorText}`);
  }

  const json = await response.json();
  const rawText = json.choices?.[0]?.message?.content?.trim() || '';

  try {
    // 剔除可能的 markdown 代码块标记
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      summary: parsed.summary || '暂无摘要',
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      recommendedCategory: parsed.recommendedCategory || '默认',
      triageRating: ['keep', 'discard', 'review'].includes(parsed.triageRating)
        ? parsed.triageRating
        : 'review',
      triageReason: parsed.triageReason || 'AI已完成评估',
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: any) => typeof t === 'string' && t.trim()).slice(0, 5) : [],
      commentsInsight: mode === 'deep' ? (parsed.commentsInsight || '暂无关键争议补充') : undefined,
      isTruncated,
      totalWordCount,
      readingMode: mode,
    };
  } catch (err) {
    console.warn('AI 解析 JSON 失败，回退文本解析', rawText);
    return {
      summary: rawText.slice(0, 150),
      keyTakeaways: [],
      recommendedCategory: '默认',
      triageRating: 'review',
      triageReason: '未能解析出结构化评估',
      tags: [],
      commentsInsight: '',
      isTruncated,
      totalWordCount,
      readingMode: mode,
    };
  }
}

/**
 * 为某个收藏夹的内容生成 50 字精炼简介
 */
export async function generateCollectionDescription(
  articles: { title: string; fullContent?: string }[]
): Promise<string> {
  const settings = await getAISettings();
  if (!settings.endpoint || !settings.model) {
    throw new Error('未配置 AI 接口或模型名称！');
  }

  const endpointUrl = normalizeEndpoint(settings.endpoint);
  const articleText = articles
    .slice(0, 15)
    .map((a) => `- 标题: ${a.title}\n  正文摘要: ${(a.fullContent || '').slice(0, 200).replace(/\s+/g, ' ')}...`)
    .join('\n\n');

  const prompt = `根据以下来自知乎收藏夹的文章标题和正文摘要，为这个收藏夹生成一段话精炼的宏观描述。
不要列举介绍各篇文章的具体主题，宏观一点。介绍是给自己看的，直接介绍，开头不要诸如"本收藏夹……"，不要诸如"特别适合xxx的人"的话，字数严格控制在50字以内，不要在最后输出字数统计。

文章列表：
${articleText}

请直接生成描述：`;

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
      messages: [
        { role: 'system', content: '你是一位专业的知识库管理员和内容分析专家。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI 生成描述请求失败 [${response.status}]`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content?.trim() || '';
}
