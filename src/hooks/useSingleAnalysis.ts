import { applyAIResult } from '../db';
import type { ZhihuArticleItem, ZhihuCollection } from '../db';
import { fetchHotComments } from '../services/zhihuApi';
import {
  quickTriageArticleWithAI,
  categorizeArticleWithAI,
  deepReadArticleWithAI,
  getAISettings,
} from '../services/ai';

interface SingleAnalysisDeps {
  collections: ZhihuCollection[];
  activeArticles: readonly ZhihuArticleItem[];
}

export function createSingleAnalysis(deps: SingleAnalysisDeps) {
  const { collections, activeArticles } = deps;
  return async function analyzeSingleArticle(
  article: ZhihuArticleItem,
  mode: 'quick' | 'categorize' | 'deep' = 'quick',
  batchTaxonomy?: string[]
): Promise<void> {
    if (mode === 'quick') {
    const res = await quickTriageArticleWithAI(article);
    // ADR-0005：AI 产物属于内容，同 contentId 的其他成员只补空、不覆盖
    await applyAIResult(article.id, {
      aiSummary: res.summary,
      aiKeyTakeaways: res.keyTakeaways,
      aiTriageRating: res.triageRating,
      aiTriageReason: res.triageReason,
      aiReadingMode: 'quick',
      isTruncated: res.isTruncated,
      totalWordCount: res.totalWordCount,
      aiProcessedAt: Date.now(),
    });
  } else if (mode === 'categorize') {
    const settings = await getAISettings();
    const maxTagCount = settings.maxTagCount || 2;
    const allowModifyTags = settings.allowModifyTags ?? true;
    const allowModifyDescription = settings.allowModifyDescription ?? true;

    // 如果用户在设置中关闭了“允许AI覆盖已有标签”，且文章已有标签，则保留既有标签
    const shouldKeepExistingTags = !allowModifyTags && article.tags && article.tags.length > 0;

    // 提炼当前库中高频标签池 (Top 30)，引导 AI 优先收敛复用已有标签，杜绝标签泛滥膨胀
    const tagCounts: Record<string, number> = {};
    activeArticles.forEach((a) => {
      (a.tags || []).forEach((t) => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });
    const existingTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([t]) => t);

    const res = await categorizeArticleWithAI(article, collections, { 
      existingTags,
      batchTaxonomy,
      maxTagCount,
      allowModifyDescription,
    });

    const updateData: Partial<ZhihuArticleItem> = {
      aiCategory: res.recommendedCategory,
      aiCategoryReason: res.categorizeReason,
      aiClassifiedAt: Date.now(),
    };

    if (!shouldKeepExistingTags) {
      // 完全按照最新 AI 词条打标调整标签数 (严格限制为 1 ~ maxTagCount 个)
      updateData.tags = res.tags.slice(0, maxTagCount);
    }

    if (allowModifyDescription && res.summary) {
      updateData.aiSummary = res.summary;
    }

    await applyAIResult(article.id, updateData);
  } else if (mode === 'deep') {
    let hotComments = article.hotComments || [];
    if (!hotComments || hotComments.length === 0) {
      try {
        hotComments = await fetchHotComments(article.contentId, article.contentType);
      } catch (err) {
        console.warn('获取热评失败:', err);
      }
    }

    const res = await deepReadArticleWithAI(article, hotComments);
    await applyAIResult(article.id, {
      aiSummary: res.summary,
      aiKeyTakeaways: res.keyTakeaways,
      aiCommentsInsight: res.commentsInsight,
      hotComments: res.hotComments || article.hotComments,
      aiReadingMode: 'deep',
      isTruncated: false,
      totalWordCount: res.totalWordCount || (article.fullContent || article.title).length,
      aiDeepReadAt: Date.now(),
    });
  }
};
}
