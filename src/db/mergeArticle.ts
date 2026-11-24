import type { ZhihuArticleItem } from './index';

/**
 * 合并一篇「远端刷新得到的文章」与「本地已有文章」。
 *
 * 规则：远端字段（标题、正文、点赞、评论、时间等）覆盖本地；
 * 本地 AI 产物与用户标记一律保留，绝不被远端空值冲掉。
 *
 * 纯函数，不触碰数据库——见 ADR-0001 与 ticket 05 的特征测试。
 */
export function mergeArticle(
  existing: ZhihuArticleItem,
  incoming: ZhihuArticleItem
): ZhihuArticleItem {
  return {
    ...incoming,
    // 标签：本地非空则优先（用户可能手工改过），否则采用远端
    tags: existing.tags && existing.tags.length > 0 ? existing.tags : incoming.tags,

    // AI 产物：本地有值即保留
    aiSummary: existing.aiSummary || incoming.aiSummary,
    aiKeyTakeaways: existing.aiKeyTakeaways || incoming.aiKeyTakeaways,
    aiCategory: existing.aiCategory || incoming.aiCategory,
    aiCategoryReason: existing.aiCategoryReason || incoming.aiCategoryReason,
    aiTriageRating: existing.aiTriageRating || incoming.aiTriageRating,
    aiTriageReason: existing.aiTriageReason || incoming.aiTriageReason,
    aiCommentsInsight: existing.aiCommentsInsight || incoming.aiCommentsInsight,
    hotComments: existing.hotComments || incoming.hotComments,

    // 阶段完成标记：仍是「是否处理过」的唯一依据（ADR-0004）
    aiProcessedAt: existing.aiProcessedAt || incoming.aiProcessedAt,
    aiClassifiedAt: existing.aiClassifiedAt || incoming.aiClassifiedAt,
    aiDeepReadAt: existing.aiDeepReadAt || incoming.aiDeepReadAt,

    // 以下字段用 ?? 而非 ||：false / 0 是有效值，不能因 falsy 被远端覆盖
    aiReadingMode: existing.aiReadingMode || incoming.aiReadingMode,
    isTruncated: existing.isTruncated ?? incoming.isTruncated,
    totalWordCount: existing.totalWordCount ?? incoming.totalWordCount,
    inTrash: existing.inTrash ?? incoming.inTrash,
    trashedAt: existing.trashedAt ?? incoming.trashedAt,
    selected: existing.selected ?? incoming.selected,
    markedForDelete: existing.markedForDelete ?? incoming.markedForDelete,
  };
}
