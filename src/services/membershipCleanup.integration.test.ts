import { beforeEach, describe, expect, it } from 'vitest';
import { db, type ZhihuArticleItem } from '../db';
import { findVanishedMemberIds } from './membershipCleanup';

function member(id: string, collectionId: string, overrides: Partial<ZhihuArticleItem> = {}): ZhihuArticleItem {
  return {
    id,
    contentId: id.split('_').pop() || id,
    contentType: 'answer',
    collectionId,
    collectionTitle: '收藏夹',
    title: '标题',
    url: 'https://www.zhihu.com',
    ...overrides,
  };
}

/** 与 Dashboard.handleFetchArticles 同构的差集 + 移入回收站流程 */
async function syncMembership(collectionId: string, remoteIds: Set<string>) {
  const localRows = await db.articles.where('collectionId').equals(collectionId).toArray();
  const vanishedIds = findVanishedMemberIds(localRows, remoteIds, collectionId);
  if (vanishedIds.length > 0) {
    const trashedAt = Date.now();
    await db.articles.bulkUpdate(
      vanishedIds.map((key) => ({ key, changes: { inTrash: true, trashedAt } }))
    );
  }
  return vanishedIds;
}

beforeEach(async () => {
  await db.articles.clear();
});

describe('成员关系消失的仓储行为', () => {
  it('消失成员移入回收站，AI 产物与手工标签原样保留', async () => {
    await db.articles.bulkPut([
      member('c1_1', 'c1', {
        aiSummary: '珍贵摘要',
        aiDeepReadAt: 12345,
        tags: ['手工标签'],
        aiTriageRating: 'keep',
      }),
    ]);

    const vanished = await syncMembership('c1', new Set());

    const stored = await db.articles.get('c1_1');
    expect(vanished).toEqual(['c1_1']);
    expect(stored?.inTrash).toBe(true);
    expect(stored?.aiSummary).toBe('珍贵摘要');
    expect(stored?.aiDeepReadAt).toBe(12345);
    expect(stored?.tags).toEqual(['手工标签']);
    expect(stored?.aiTriageRating).toBe('keep');
  });

  it('同一内容在其他收藏夹的成员不受影响', async () => {
    await db.articles.bulkPut([
      member('c1_100', 'c1'),
      member('c2_100', 'c2', { aiSummary: '另一夹的摘要' }),
    ]);

    await syncMembership('c1', new Set());

    expect((await db.articles.get('c1_100'))?.inTrash).toBe(true);
    const sibling = await db.articles.get('c2_100');
    expect(sibling?.inTrash).not.toBe(true);
    expect(sibling?.aiSummary).toBe('另一夹的摘要');
  });

  it('已在回收站的行不会被再次处理', async () => {
    await db.articles.bulkPut([member('c1_1', 'c1', { inTrash: true, trashedAt: 1000 })]);

    const vanished = await syncMembership('c1', new Set());

    expect(vanished).toEqual([]);
    expect((await db.articles.get('c1_1'))?.trashedAt).toBe(1000);
  });

  it('远端仍在的成员不被移入回收站', async () => {
    await db.articles.bulkPut([member('c1_1', 'c1'), member('c1_2', 'c1')]);

    await syncMembership('c1', new Set(['c1_1', 'c1_2']));

    const rows = await db.articles.where('collectionId').equals('c1').toArray();
    expect(rows.every((r) => !r.inTrash)).toBe(true);
  });
});
