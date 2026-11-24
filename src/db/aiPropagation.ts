import type { ZhihuArticleItem } from './index';

/**
 * AI 产物字段：它们描述的是「这篇内容讲了什么」，与「这篇内容被收进了哪个收藏夹」无关。
 * 因此同一 contentId 的所有成员行应当看到同一份产物（ADR-0005）。
 */
export const AI_PRODUCT_FIELDS = [
  // 分类阶段的标签也会写到这里；补空规则保证只有空标签的成员才会被填上
  'tags',
  'aiSummary',
  'aiKeyTakeaways',
  'aiCategory',
  'aiCategoryReason',
  'aiTriageRating',
  'aiTriageReason',
  'aiCommentsInsight',
  'hotComments',
  'aiProcessedAt',
  'aiClassifiedAt',
  'aiDeepReadAt',
  'aiReadingMode',
  'isTruncated',
  'totalWordCount',
] as const;

export type AIProductField = (typeof AI_PRODUCT_FIELDS)[number];

/**
 * 判断某个字段是否「还空着」。
 * 注意 false 与 0 是有效值（例如 `isTruncated: false`、`totalWordCount: 0`），不能当作空。
 */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * 从一次 AI 写入中挑出目标行仍然为空、且可以安全补上的字段。
 * 只处理 {@link AI_PRODUCT_FIELDS}，成员特有字段（collectionId / inTrash / selected 等）不参与传播。
 */
export function buildFillPatch(
  target: Partial<ZhihuArticleItem>,
  patch: Partial<ZhihuArticleItem>
): Partial<ZhihuArticleItem> {
  const fill: Partial<Record<AIProductField, unknown>> = {};

  for (const field of AI_PRODUCT_FIELDS) {
    if (!(field in patch)) continue;
    const incoming = patch[field];
    if (isEmptyValue(incoming)) continue;
    if (!isEmptyValue(target[field])) continue;
    fill[field] = incoming;
  }

  return fill as Partial<ZhihuArticleItem>;
}

export interface CollapseResult<T> {
  /** 每个 contentId 保留的一行，顺序与原数组一致 */
  kept: T[];
  /** 被折叠掉的行，以及它跟随的代表行 */
  collapsed: Array<{ dropped: T; keptBy: T }>;
}

/**
 * 按 contentId 折叠，保证一次批次里同一内容只派一个代表任务。
 *
 * - `needsWork` 为真表示这一行确实需要（重新）调用 AI；代表优先取这样的一行，
 *   避免折叠到一行已经处理过的成员上，让真正缺结果的那行永远轮不到；
 * - 全部成员都已满足时，取选择顺序中的第一行；
 * - `contentId` 缺失的行无法判断是否同一内容，原样保留。
 */
export function collapseByContentId<T extends { id: string; contentId?: string }>(
  articles: readonly T[],
  needsWork: (article: T) => boolean = () => true
): CollapseResult<T> {
  const keyOf = (article: T): string => article.contentId?.trim() ?? '';

  const chosen = new Map<string, T>();
  for (const article of articles) {
    const key = keyOf(article);
    if (!key) continue;

    const current = chosen.get(key);
    if (!current) {
      chosen.set(key, article);
      continue;
    }
    // 用「真正需要处理」的一行替换掉已满足的代表，保证折叠不会掩盖待办
    if (!needsWork(current) && needsWork(article)) {
      chosen.set(key, article);
    }
  }

  const kept: T[] = [];
  const collapsed: Array<{ dropped: T; keptBy: T }> = [];
  const emitted = new Set<string>();

  for (const article of articles) {
    const key = keyOf(article);
    if (!key) {
      kept.push(article);
      continue;
    }

    const representative = chosen.get(key) as T;
    if (representative === article) {
      if (!emitted.has(key)) {
        kept.push(article);
        emitted.add(key);
      }
      continue;
    }

    collapsed.push({ dropped: article, keptBy: representative });
  }

  return { kept, collapsed };
}
