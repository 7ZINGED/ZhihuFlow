import { describe, expect, it } from 'vitest';
import type { ZhihuArticleItem } from '../db';
import { findVanishedMemberIds } from './membershipCleanup';

function member(id: string, collectionId = 'c1', overrides: Partial<ZhihuArticleItem> = {}): ZhihuArticleItem {
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

describe('findVanishedMemberIds', () => {
  it('返回本地有但远端没有的成员', () => {
    const local = [member('c1_1'), member('c1_2'), member('c1_3')];
    const remote = new Set(['c1_1', 'c1_3']);

    expect(findVanishedMemberIds(local, remote, 'c1')).toEqual(['c1_2']);
  });

  it('只比较指定收藏夹，不误伤同内容的其他成员', () => {
    const local = [
      member('c1_100', 'c1'),
      member('c2_100', 'c2'), // 同一内容在另一个收藏夹
    ];
    const remote = new Set(['c2_100']);

    expect(findVanishedMemberIds(local, remote, 'c1')).toEqual(['c1_100']);
  });

  it('跳过已在回收站的行，避免覆盖用户手工移入的时间', () => {
    const local = [
      member('c1_1', 'c1', { inTrash: true, trashedAt: 1000 }),
      member('c1_2'),
    ];

    expect(findVanishedMemberIds(local, new Set(), 'c1')).toEqual(['c1_2']);
  });

  it('保留远端返回的失效占位条目', () => {
    const local = [member('c1_deleted_9', 'c1', { isDeletedOrInvalid: true })];
    const remote = new Set(['c1_deleted_9']);

    expect(findVanishedMemberIds(local, remote, 'c1')).toEqual([]);
  });

  it('远端为空集时返回所有非回收站成员', () => {
    const local = [member('c1_1'), member('c1_2')];

    expect(findVanishedMemberIds(local, new Set(), 'c1')).toEqual(['c1_1', 'c1_2']);
  });

  it('不返回任何 AI 字段，调用方无法借此覆盖产物', () => {
    const result = findVanishedMemberIds(
      [member('c1_1', 'c1', { aiSummary: '珍贵摘要', tags: ['手工'] })],
      new Set(),
      'c1'
    );

    expect(result).toEqual(['c1_1']);
  });
});
