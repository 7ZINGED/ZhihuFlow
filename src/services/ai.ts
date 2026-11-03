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
 */
export async function analyzeArticleWithAI(
  title: string,
  content: string,
  targetCollections: { id: string; title: string; description?: string }[]
): Promise<AIAnalysisResult> {
  const settings = await getAISettings();
  if (!settings.endpoint || !settings.model) {
    throw new Error('未配置 AI 接口或模型名称，请前往设置面板配置！');
  }

  const endpointUrl = normalizeEndpoint(settings.endpoint);

  const collectionsDesc = targetCollections
    .map((c) => `- 「${c.title}」: ${c.description || '无具体说明'}`)
    .join('\n');

  // 构建结构化输出 Prompt
  const systemPrompt = `你是一位严谨的个人知识库管理员与内容精读专家。你的任务是快速读完用户从知乎收藏的内容，提炼其核心高价值观点，并给出收藏分拣处理建议（是否值得继续保留、还是应移入归档/弃置）。`;

  const userPrompt = `【待分析的知乎内容】
标题：${title}
正文摘要/内容片段（前 1200 字）：
${content.slice(0, 1200)}

【用户现有的收藏夹清单】：
${collectionsDesc || '（暂无其他收藏夹）'}

请以 JSON 格式严格输出你的分析结果，包含且仅包含以下键：
{
  "summary": "100字以内的宏观凝练摘要，直接陈述内容本质，不要以'本文...'开头",
  "keyTakeaways": ["核心提炼要点1", "核心提炼要点2", "核心提炼要点3"],
  "tags": ["核心主题标签1", "标签2"],
  "recommendedCategory": "从上述收藏夹列表中挑选最合适的目标收藏夹完整标题（若均不合适填'其他'）",
  "triageRating": "keep" 或 "discard" 或 "review"（keep表示'值得留'，高价值干货；discard表示'可清理'，时效差/水文/废话；review表示'不确定'，待人工确认）,
  "triageReason": "20字以内的分拣评级理由说明"
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
