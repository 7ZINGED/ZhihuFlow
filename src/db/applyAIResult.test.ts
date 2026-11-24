import { beforeEach, describe, expect, it } from 'vitest';
import { applyAIResult, db, type ZhihuArticleItem } from './index';

function article(overrides: Partial<ZhihuArticleItem> = {}): ZhihuArticleItem {
  return {
    id: 'c1_100',
    contentId: '100',
    contentType: 'answer',
    collectionId: 'c1',
    collectionTitle: '收藏夹一',
    title: '标题',
    url: 'https://www.zhihu.com/question/1/answer/100',
    ...overrides,
  };
}

beforeEach(async () => {
  await db.articles.clear();
});

describe('applyAIResult', () => {
  it('写入目标行，并把空缺补到同内容的其他成员', async () => {
    await db.articles.bulkPut([article(), article({ id: 'c2_100', collectionId: 'c2' })]);

    const outcome = await applyAIResult('c1_100', {
      aiSummary: '摘要',
      aiTriageRating: 'keep',
      aiProcessedAt: 11,
    });

    expect(outcome).toEqual({ updated: 1, filled: 1 });

    const sibling = await db.articles.get('c2_100');
    expect(sibling?.aiSummary).toBe('摘要');
    expect(sibling?.aiTriageRating).toBe('keep');
    expect(sibling?.aiProcessedAt).toBe(11);
  });

  it('不覆盖同内容成员已有的产物与手工标签', async () => {
    await db.articles.bulkPut([
      article(),
      article({ id: 'c2_100', collectionId: 'c2', aiSummary: '旧摘要', tags: ['手工标签'] }),
    ]);

    await applyAIResult('c1_100', { aiSummary: '新摘要', tags: ['AI 标签'] });

    const sibling = await db.articles.get('c2_100');
    expect(sibling?.aiSummary).toBe('旧摘要');
    expect(sibling?.tags).toEqual(['手工标签']);
  });

  it('成员特有字段不传播', async () => {
    await db.articles.bulkPut([article(), article({ id: 'c2_100', collectionId: 'c2' })]);

    await applyAIResult('c1_100', { aiSummary: '摘要' });

    const sibling = await db.articles.get('c2_100');
    expect(sibling?.collectionId).toBe('c2');
    expect(sibling?.inTrash).toBeUndefined();
  });

  it('propagate: false 时只写目标行', async () => {
    await db.articles.bulkPut([article(), article({ id: 'c2_100', collectionId: 'c2' })]);

    const outcome = await applyAIResult('c1_100', { aiSummary: '摘要' }, { propagate: false });

    expect(outcome).toEqual({ updated: 1, filled: 0 });
    expect((await db.articles.get('c2_100'))?.aiSummary).toBeUndefined();
  });

  it('不同内容不受影响', async () => {
    await db.articles.bulkPut([article(), article({ id: 'c1_200', contentId: '200' })]);

    await applyAIResult('c1_100', { aiSummary: '摘要' });

    expect((await db.articles.get('c1_200'))?.aiSummary).toBeUndefined();
  });

  it('文章不存在时返回 updated 0 且不写入任何行', async () => {
    await db.articles.bulkPut([article({ id: 'c1_100' })]);

    const outcome = await applyAIResult('missing', { aiSummary: '摘要' });

    expect(outcome).toEqual({ updated: 0, filled: 0 });
    expect((await db.articles.get('c1_100'))?.aiSummary).toBeUndefined();
  });

  it('三个成员时一次写入补齐两行', async () => {
    await db.articles.bulkPut([
      article(),
      article({ id: 'c2_100', collectionId: 'c2' }),
      article({ id: 'c3_100', collectionId: 'c3' }),
    ]);

    const outcome = await applyAIResult('c1_100', { aiDeepReadAt: 99, aiSummary: '精读摘要' });

    expect(outcome.filled).toBe(2);
    expect((await db.articles.get('c2_100'))?.aiDeepReadAt).toBe(99);
    expect((await db.articles.get('c3_100'))?.aiSummary).toBe('精读摘要');
  });
});
