import { describe, expect, it } from 'vitest';
import { buildFillPatch, collapseByContentId, isEmptyValue } from './aiPropagation';
import type { ZhihuArticleItem } from './index';

describe('isEmptyValue', () => {
  it('undefined / null / 空串 / 空数组算空', () => {
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue('   ')).toBe(true);
    expect(isEmptyValue([])).toBe(true);
  });

  it('false 与 0 是有效值', () => {
    expect(isEmptyValue(false)).toBe(false);
    expect(isEmptyValue(0)).toBe(false);
  });
});

describe('buildFillPatch', () => {
  it('目标行缺字段时补上', () => {
    const fill = buildFillPatch({}, { aiSummary: '摘要', aiTriageRating: 'keep' });

    expect(fill).toEqual({ aiSummary: '摘要', aiTriageRating: 'keep' });
  });

  it('目标行已有值时不覆盖', () => {
    const fill = buildFillPatch(
      { aiSummary: '本地摘要', tags: ['手工标签'] },
      { aiSummary: 'AI 新摘要', tags: ['AI 标签'] }
    );

    expect(fill).toEqual({});
  });

  it('空字符串与空数组视为空缺，可以补', () => {
    const fill = buildFillPatch(
      { aiSummary: '   ', tags: [] },
      { aiSummary: '有值', tags: ['标签'] }
    );

    expect(fill).toEqual({ aiSummary: '有值', tags: ['标签'] });
  });

  it('false 与 0 不会被覆盖', () => {
    const fill = buildFillPatch(
      { isTruncated: false, totalWordCount: 0 },
      { isTruncated: true, totalWordCount: 1200 }
    );

    expect(fill).toEqual({});
  });

  it('补丁里没有的字段不会凭空产生', () => {
    const fill = buildFillPatch({}, { aiSummary: '摘要' });

    expect('aiCategory' in fill).toBe(false);
    expect('aiDeepReadAt' in fill).toBe(false);
  });

  it('补丁中的空值不会被传播', () => {
    const fill = buildFillPatch({}, { aiSummary: '', aiKeyTakeaways: [] });

    expect(fill).toEqual({});
  });

  it('成员特有字段不参与传播', () => {
    const patch: Partial<ZhihuArticleItem> = {
      collectionId: 'c2',
      inTrash: true,
      selected: true,
      aiSummary: '摘要',
    };

    expect(buildFillPatch({}, patch)).toEqual({ aiSummary: '摘要' });
  });
});

interface Row {
  id: string;
  contentId?: string;
}

const row = (id: string, contentId?: string): Row => ({ id, contentId });

describe('collapseByContentId', () => {
  it('同一内容只保留一行', () => {
    const { kept, collapsed } = collapseByContentId([row('c1_100', '100'), row('c2_100', '100')]);

    expect(kept.map((a) => a.id)).toEqual(['c1_100']);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.dropped.id).toBe('c2_100');
    expect(collapsed[0]?.keptBy.id).toBe('c1_100');
  });

  it('已满足的成员不会顶掉真正需要处理的一行', () => {
    const done = row('c1_100', '100');
    const pending = row('c2_100', '100');

    const { kept, collapsed } = collapseByContentId([done, pending], (a) => a.id === 'c2_100');

    expect(kept.map((a) => a.id)).toEqual(['c2_100']);
    expect(collapsed.map((c) => c.dropped.id)).toEqual(['c1_100']);
  });

  it('全部已满足时保留选择顺序中的第一行', () => {
    const { kept } = collapseByContentId([row('c1_100', '100'), row('c2_100', '100')], () => false);

    expect(kept.map((a) => a.id)).toEqual(['c1_100']);
  });

  it('不同内容各自保留，且保持原有顺序', () => {
    const { kept, collapsed } = collapseByContentId([
      row('c1_100', '100'),
      row('c1_200', '200'),
      row('c2_100', '100'),
    ]);

    expect(kept.map((a) => a.id)).toEqual(['c1_100', 'c1_200']);
    expect(collapsed.map((c) => c.dropped.id)).toEqual(['c2_100']);
  });

  it('contentId 缺失的行原样保留，不互相折叠', () => {
    const { kept, collapsed } = collapseByContentId([row('a', ''), row('b', undefined)]);

    expect(kept.map((a) => a.id)).toEqual(['a', 'b']);
    expect(collapsed).toHaveLength(0);
  });

  it('三个成员折叠后只剩代表行', () => {
    const { kept, collapsed } = collapseByContentId([
      row('c1_100', '100'),
      row('c2_100', '100'),
      row('c3_100', '100'),
    ]);

    expect(kept).toHaveLength(1);
    expect(collapsed).toHaveLength(2);
  });
});
