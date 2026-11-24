import { beforeEach, describe, expect, it } from 'vitest';
import { db, safeUpsertArticles, type ZhihuArticleItem } from './index';

function article(overrides: Partial<ZhihuArticleItem> = {}): ZhihuArticleItem {
  return {
    id: 'c1_100',
    contentId: '100',
    contentType: 'answer',
    collectionId: 'c1',
    collectionTitle: '收藏夹',
    title: '标题',
    url: 'https://www.zhihu.com/question/1/answer/100',
    ...overrides,
  };
}

beforeEach(async () => {
  await db.articles.clear();
});

describe('safeUpsertArticles', () => {
  it('新文章直接写入', async () => {
    await safeUpsertArticles([article({ tags: ['新标签'] })]);

    const stored = await db.articles.get('c1_100');
    expect(stored?.tags).toEqual(['新标签']);
    expect(stored?.title).toBe('标题');
  });

  it('已有文章刷新时保留本地 AI 产物', async () => {
    await safeUpsertArticles([article({ aiSummary: '本地摘要', aiTriageRating: 'keep', tags: ['本地标签'] })]);

    await safeUpsertArticles([article({ voteupCount: 500, tags: [] })]);

    const stored = await db.articles.get('c1_100');
    expect(stored?.voteupCount).toBe(500);
    expect(stored?.aiSummary).toBe('本地摘要');
    expect(stored?.aiTriageRating).toBe('keep');
    expect(stored?.tags).toEqual(['本地标签']);
  });

  it('id 不匹配但 contentId 相同时沿用本地 AI 产物', async () => {
    await safeUpsertArticles([article({ aiSummary: '跨收藏夹的本地摘要', aiClassifiedAt: 7 })]);

    // 同一篇回答被归入另一个收藏夹，id 变化、contentId 不变
    await safeUpsertArticles([article({ id: 'c2_100', collectionId: 'c2', collectionTitle: '收藏夹二' })]);

    const stored = await db.articles.get('c2_100');
    expect(stored?.aiSummary).toBe('跨收藏夹的本地摘要');
    expect(stored?.aiClassifiedAt).toBe(7);
  });

  it('空数组不产生写入', async () => {
    await safeUpsertArticles([]);

    expect(await db.articles.count()).toBe(0);
  });
});
