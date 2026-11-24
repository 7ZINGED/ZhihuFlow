import { describe, expect, it } from 'vitest';
import type { ZhihuArticleItem } from './index';
import { mergeArticle } from './mergeArticle';

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

describe('mergeArticle', () => {
  it('远端元数据覆盖本地：点赞、评论、正文、标题', () => {
    const existing = article({ voteupCount: 10, commentCount: 1, fullContent: '旧正文', title: '旧标题' });
    const incoming = article({ voteupCount: 99, commentCount: 8, fullContent: '新正文', title: '新标题' });

    const merged = mergeArticle(existing, incoming);

    expect(merged.voteupCount).toBe(99);
    expect(merged.commentCount).toBe(8);
    expect(merged.fullContent).toBe('新正文');
    expect(merged.title).toBe('新标题');
  });

  it('本地标签优先，不被远端空标签冲掉', () => {
    const existing = article({ tags: ['前端架构', '工程化'] });
    const incoming = article({ tags: [] });

    expect(mergeArticle(existing, incoming).tags).toEqual(['前端架构', '工程化']);
  });

  it('本地无标签时采用远端标签', () => {
    const existing = article({ tags: [] });
    const incoming = article({ tags: ['量化金融'] });

    expect(mergeArticle(existing, incoming).tags).toEqual(['量化金融']);
  });

  it('保留全部本地 AI 产物与阶段标记', () => {
    const existing = article({
      aiSummary: '本地摘要',
      aiKeyTakeaways: ['要点一', '要点二'],
      aiCategory: '前端架构',
      aiCategoryReason: '主题匹配',
      aiTriageRating: 'keep',
      aiTriageReason: '硬核实操',
      aiCommentsInsight: '评论区补充了边界条件',
      hotComments: ['热评一'],
      aiProcessedAt: 1,
      aiClassifiedAt: 2,
      aiDeepReadAt: 3,
      aiReadingMode: 'deep',
    });

    const merged = mergeArticle(existing, article());

    expect(merged.aiSummary).toBe('本地摘要');
    expect(merged.aiKeyTakeaways).toEqual(['要点一', '要点二']);
    expect(merged.aiCategory).toBe('前端架构');
    expect(merged.aiCategoryReason).toBe('主题匹配');
    expect(merged.aiTriageRating).toBe('keep');
    expect(merged.aiTriageReason).toBe('硬核实操');
    expect(merged.aiCommentsInsight).toBe('评论区补充了边界条件');
    expect(merged.hotComments).toEqual(['热评一']);
    expect(merged.aiProcessedAt).toBe(1);
    expect(merged.aiClassifiedAt).toBe(2);
    expect(merged.aiDeepReadAt).toBe(3);
    expect(merged.aiReadingMode).toBe('deep');
  });

  it('保留本地用户标记，且 false 不被当成空值覆盖', () => {
    const existing = article({ inTrash: true, trashedAt: 42, selected: false, markedForDelete: false, isTruncated: false });
    const incoming = article({ inTrash: false, selected: true, markedForDelete: true, isTruncated: true });

    const merged = mergeArticle(existing, incoming);

    expect(merged.inTrash).toBe(true);
    expect(merged.trashedAt).toBe(42);
    expect(merged.selected).toBe(false);
    expect(merged.markedForDelete).toBe(false);
    expect(merged.isTruncated).toBe(false);
  });

  it('本地字段为空时接受远端值', () => {
    const existing = article({ aiSummary: undefined, totalWordCount: undefined });
    const incoming = article({ aiSummary: '远端带了摘要', totalWordCount: 1200 });

    const merged = mergeArticle(existing, incoming);

    expect(merged.aiSummary).toBe('远端带了摘要');
    expect(merged.totalWordCount).toBe(1200);
  });
});
