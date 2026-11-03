import { type AISettings } from '../db';

export const DEFAULT_AI_SETTINGS: AISettings = {
  endpoint: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
};

export async function getAISettings(): Promise<AISettings> {
  const result = await chrome.storage.local.get(['ai_settings']);
  return result.ai_settings || DEFAULT_AI_SETTINGS;
}

export async function saveAISettings(settings: AISettings): Promise<void> {
  await chrome.storage.local.set({ ai_settings: settings });
}

export interface AIAnalysisResult {
  summary: string;
  keyTakeaways: string[];
  recommendedCategory: string;
  triageRating: 'keep' | 'discard' | 'review';
  triageReason: string;
  tags?: string[];
  commentsInsight?: string;
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
 * 调用通用 OpenAI 兼容接口，为单篇文章生成 MoonDigest 风格的摘读、要点及分拣建议
 * 融合 4500 字长正文 + 赞同/评论互动指标 + 热评/神评 Top 5 洞察
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
  hotComments: string[] = []
): Promise<AIAnalysisResult> {
  const settings = await getAISettings();
  if (!settings.endpoint || !settings.model) {
    throw new Error('未配置 AI 接口或模型名称，请前往设置面板配置！');
  }

  const endpointUrl = normalizeEndpoint(settings.endpoint);

  const collectionsDesc = targetCollections
    .map((c) => `- 「${c.title}」: ${c.description || '无具体说明'}`)
    .join('\n');

  // 放开正文篇幅到 4500 字（覆盖绝大多数知乎高赞长文）
  const contentText = (article.fullContent || article.title).trim();
  const truncatedContent = contentText.slice(0, 4500);

  // 整理热评 Top 5
  const commentsText = hotComments && hotComments.length > 0
    ? hotComments.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '（暂无热评或未开启评论区）';

  // 构建结构化输出 Prompt
  const systemPrompt = `你是一位严谨的个人知识库管理员与内容精读专家。你的任务是通读用户从知乎收藏的内容（深度阅读长文本正文、结合互动量与评论区高赞热评），提炼其核心高价值干货与评论区洞察，并给出科学的分拣处理建议（值得留 / 可清理 / 不确定）。

【分拣与评估准则】：
1. 综合考量正文深度、干货密度与互动指标：
   - 赞同数高、答主专业且论证详实的专业回答/深度长文应优先评为「值得留 (keep)」；
   - 时效性弱的八卦资讯、情绪宣泄、广告引流或空洞水文应评为「可清理 (discard)」；
   - 结论争议较大、需读者结合自身情况二次复核的内容评为「不确定 (review)」。
2. 结合评论区高赞反馈：若热评中有关键补充、指出了文章漏洞或提供了反向验证案例，务必在「commentsInsight」中精准提炼出来。`;

  const userPrompt = `【待分析的知乎内容详情】
- 标题/问题：${article.title}
- 答主/作者：${article.authorName || '知乎用户'}
- 互动指标：赞同数 ${article.voteupCount || 0} | 评论数 ${article.commentCount || 0}
- 当前收藏于：${article.collectionTitle || '默认'}

【正文长文本内容（前 4500 字）】：
${truncatedContent}

【评论区高赞热评 / 神评 Top 5】：
${commentsText}

【用户现有的收藏夹清单】：
${collectionsDesc || '（暂无其他收藏夹）'}

请以 JSON 格式严格输出你的分析结果，包含且仅包含以下键：
{
  "summary": "120字以内的宏观凝练摘要，直接陈述内容本质与作者核心观点，不要以'本文...'开头",
  "keyTakeaways": ["核心实操/观点要点1", "核心实操/观点要点2", "核心实操/观点要点3"],
  "commentsInsight": "40字以内的评论区高赞焦点、关键争议或实践补充（若热评无实质内容则写'暂无关键争议补充'）",
  "tags": ["核心主题标签1", "标签2"],
  "recommendedCategory": "从上述收藏夹列表中挑选最合适的目标收藏夹完整标题（若均不合适填'其他'）",
  "triageRating": "keep" 或 "discard" 或 "review"（keep表示'值得留'；discard表示'可清理'；review表示'不确定'）,
  "triageReason": "结合正文干货度、赞同量及评论反馈给出的25字以内分拣评级理由说明"
}
请注意：直接返回合法的 JSON 字符串，不要带 markdown 代码块包裹，也不要有任何其他文字。`;

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
      commentsInsight: parsed.commentsInsight || '暂无关键争议补充',
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
