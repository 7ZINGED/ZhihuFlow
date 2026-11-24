import type { ZhihuArticleItem } from '../db';

/**
 * 找出「成员关系已从远端消失」的本地行。
 *
 * 语义见 ticket 14 / ADR-0006：差集表示「这条收藏夹成员关系没了」，
 * 而不是「内容失效」。因此只返回 id，由调用方移入回收站；
 * 不碰任何 AI 产物字段，也不区分 contentType。
 *
 * 安全约束：
 * - 只比较传入的 `collectionId`（防止跨收藏夹误伤）；
 * - 已在回收站的行跳过，避免覆盖用户手工移入时的 trashedAt；
 * - 远端集合里出现的 id 一律保留（含失效占位条目 `${cid}_deleted_${id}`）。
 */
export function findVanishedMemberIds(
  localRows: readonly ZhihuArticleItem[],
  remoteIds: ReadonlySet<string>,
  collectionId: string
): string[] {
  return localRows
    .filter((row) => row.collectionId === collectionId)
    .filter((row) => !row.inTrash)
    .filter((row) => !remoteIds.has(row.id))
    .map((row) => row.id);
}
