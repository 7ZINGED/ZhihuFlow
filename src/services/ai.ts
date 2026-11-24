import { type AISettings } from '../db';
import { mapHttpError, normalizeTags, parseAiJson, stripCodeFence } from './aiParse';
import {
  DEFAULT_CATEGORIZE_PROMPT,
  DEFAULT_TRIAGE_PROMPT,
  buildBatchCategorizeMessages,
  buildCategorizeMessages,
  buildCollectionDescriptionMessages,
  buildDeepReadMessages,
  buildQuickTriageMessages,
  buildTaxonomyMessages,
  measureQuickTriageContent,
  resolveBatchCategorizeConfig,
  resolveCategorizeConfig,
  resolveTaxonomyConfig,
  type BatchCategorizeOptions,
  type CategorizeOptions,
  type TaxonomyOptions,
} from './aiPrompts';

// ticket 11：常量已移到 aiPrompts.ts，保留原导出路径供 SettingsModal 使用
export { DEFAULT_TRIAGE_PROMPT, DEFAULT_CATEGORIZE_PROMPT } from './aiPrompts';
export type { CategorizeOptions } from './aiPrompts';

export const DEFAULT_AI_SETTINGS: AISettings = {
  endpoint: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
  customTriagePrompt: DEFAULT_TRIAGE_PROMPT,
  customCategorizePrompt: DEFAULT_CATEGORIZE_PROMPT,
  maxTagCount: 2,
  allowModifyTags: true,
  allowModifyDescription: true,
  batchLimitQuick: 30,
  batchLimitCategorize: 20,
  batchLimitDeep: 10,
  maxGlobalTags: 8,
  adaptiveGlobalTags: true,
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

  let response: Response;
  try {
    response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: settings.model.trim(),
        messages,
        temperature,
      }),
    });
  } catch (netErr: any) {
    throw new Error(`网络连接失败（无法连通 ${endpointUrl}，请检查网络或代理）: ${netErr?.message || netErr}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI 请求失败 [${response.status}]: ${mapHttpError(response.status, errorText)}`);
  }

  const json = await response.json();
  const rawText = json.choices?.[0]?.message?.content?.trim() || '';
  return stripCodeFence(rawText);
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
  const { isTruncated, totalWordCount } = measureQuickTriageContent(article);

  const rawJson = await callChatCompletions(buildQuickTriageMessages(article, settings));

  try {
    const parsed = parseAiJson<any>(rawJson);
    if (!parsed) throw new Error('粗读结果不是合法 JSON');
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

/**
 * 阶段 2 (Pass 1)：针对一批文章综合自适应提炼收敛的全局核心标签词典 (Taxonomy Synthesis)
 * 基于各文章的粗读/精读摘要，由大模型在全局视角提取规范、互斥、高聚合的标签库
 */
export async function synthesizeBatchTaxonomy(
  articles: {
    title: string;
    aiSummary?: string;
    aiKeyTakeaways?: string[];
    aiCommentsInsight?: string;
  }[],
  options: TaxonomyOptions = {}
): Promise<string[]> {
  if (articles.length === 0) return [];

  const settings = await getAISettings();
  const config = resolveTaxonomyConfig(settings, options);
  const { maxGlobalTags } = config;

  try {
    const rawJson = await callChatCompletions(buildTaxonomyMessages(articles, config), 0.2);

    const parsed = parseAiJson<unknown>(rawJson);
    if (Array.isArray(parsed)) {
      const clean = normalizeTags(parsed, maxGlobalTags);
      if (clean.length > 0) return clean;
    }
  } catch (err) {
    console.warn('全局标签聚类 Pass 1 提炼异常，将回退到默认高频词池:', err);
  }

  return [];
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
  const config = resolveCategorizeConfig(settings, options);
  const { maxTagCount, allowModifyDescription } = config;

  const rawJson = await callChatCompletions(buildCategorizeMessages(article, targetCollections, config));

  try {
    const parsed = parseAiJson<any>(rawJson);
    if (!parsed) throw new Error('词条分类结果不是合法 JSON');
    // 严格限制为 1 ~ maxTagCount 个规范标签，过滤无效空值与符号
    const cleanTags = normalizeTags(parsed.tags, maxTagCount);

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

export interface BatchCategorizeItem {
  id: string;
  tags: string[];
  recommendedCategory: string;
  categorizeReason?: string;
  summary?: string;
}

/**
 * 阶段 2 (Pass 2)：整批单次批量打标映射 (Batch One-Shot Categorization)
 * 将当前子批次（如 20 篇）打包在单次请求中，由 AI 在全局收敛的标签词库下，一次性返回整批文章的标签归属与推荐收藏夹
 */
export async function batchCategorizeArticlesWithAI(
  articles: {
    id: string;
    title: string;
    fullContent?: string;
    aiSummary?: string;
    aiKeyTakeaways?: string[];
    aiCommentsInsight?: string;
    collectionTitle?: string;
  }[],
  targetCollections: { id: string; title: string; description?: string }[],
  options: BatchCategorizeOptions = {}
): Promise<Map<string, BatchCategorizeItem>> {
  const resultMap = new Map<string, BatchCategorizeItem>();
  if (articles.length === 0) return resultMap;

  // 若只有 1 篇，直接调用单篇打标接口
  if (articles.length === 1) {
    const single = articles[0];
    if (!single) return resultMap;
    const res = await categorizeArticleWithAI(single, targetCollections, {
      batchTaxonomy: options.batchTaxonomy,
      maxTagCount: options.maxTagCount,
      allowModifyDescription: options.allowModifyDescription,
      existingTags: options.existingTags,
    });
    resultMap.set(single.id, {
      id: single.id,
      tags: res.tags,
      recommendedCategory: res.recommendedCategory,
      categorizeReason: res.categorizeReason,
      summary: res.summary,
    });
    return resultMap;
  }

  const settings = await getAISettings();
  const config = resolveBatchCategorizeConfig(settings, options);
  const { maxTagCount, allowModifyDescription, batchTaxonomy } = config;

  const rawJson = await callChatCompletions(
    buildBatchCategorizeMessages(articles, targetCollections, config)
  );

  try {
    const parsed: any = parseAiJson(rawJson);

    if (Array.isArray(parsed)) {
      for (let i = 0; i < articles.length; i++) {
        const art = articles[i];
        if (!art) continue;
        const item = parsed.find((p: any) => p && String(p.id).trim() === art.id) || parsed[i];
        if (item) {
          const cleanTags = normalizeTags(item.tags, maxTagCount);

          resultMap.set(art.id, {
            id: art.id,
            tags: cleanTags.length > 0 ? cleanTags : (batchTaxonomy.length > 0 ? [batchTaxonomy[0] ?? '未归类'] : ['未归类']),
            recommendedCategory: item.recommendedCategory || '默认',
            categorizeReason: item.categorizeReason || 'AI整批聚类匹配',
            summary: allowModifyDescription ? item.summary?.trim() : undefined,
          });
        }
      }
    }
  } catch (err) {
    console.warn('整批一次性打标 JSON 解析异常，准备自动兜底:', err);
  }

  // 兜底处理：若某篇文章在批量返回中遗漏，为其单独调用单篇打标保证 100% 成功
  for (const art of articles) {
    if (!resultMap.has(art.id)) {
      try {
        const fallbackRes = await categorizeArticleWithAI(art, targetCollections, {
          batchTaxonomy,
          maxTagCount,
          allowModifyDescription,
          existingTags: options.existingTags,
        });
        resultMap.set(art.id, {
          id: art.id,
          tags: fallbackRes.tags,
          recommendedCategory: fallbackRes.recommendedCategory,
          categorizeReason: fallbackRes.categorizeReason,
          summary: fallbackRes.summary,
        });
      } catch {
        resultMap.set(art.id, {
          id: art.id,
          tags: batchTaxonomy.length > 0 ? [batchTaxonomy[0] ?? '未归类'] : ['未归类'],
          recommendedCategory: '默认',
          categorizeReason: 'AI打标完成',
        });
      }
    }
  }

  return resultMap;
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
  const rawJson = await callChatCompletions(buildDeepReadMessages(article, hotComments));

  try {
    const parsed = parseAiJson<any>(rawJson);
    if (!parsed) throw new Error('精读结果不是合法 JSON');
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
  categorizeReason?: string;
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
      categorizeReason: catRes.categorizeReason,
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
  return await callChatCompletions(buildCollectionDescriptionMessages(articles), 0.7);
}
