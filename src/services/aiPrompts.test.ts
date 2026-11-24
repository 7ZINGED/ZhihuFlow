import { describe, expect, it } from 'vitest';
import type { AISettings } from '../db';
import {
  DEFAULT_CATEGORIZE_PROMPT,
  DEFAULT_TRIAGE_PROMPT,
  buildBatchCategorizeMessages,
  buildCategorizeMessages,
  buildCollectionDescriptionMessages,
  buildDeepReadMessages,
  buildQuickTriageMessages,
  buildTaxonomyMessages,
  measureQuickTriageContent,
  resolveBatchCategorizeConfig,
  resolveCategorizeConfig,
  resolveTaxonomyConfig,
} from './aiPrompts';

function settings(overrides: Partial<AISettings> = {}): AISettings {
  return {
    endpoint: 'https://api.example.com/v1',
    model: 'test-model',
    apiKey: 'test-key',
    maxTagCount: 2,
    maxGlobalTags: 8,
    adaptiveGlobalTags: true,
    allowModifyDescription: true,
    ...overrides,
  };
}

const article = {
  title: '如何理解事件循环',
  authorName: '张三',
  voteupCount: 1234,
  commentCount: 56,
  collectionTitle: '技术',
  fullContent: '正文内容。'.repeat(10),
  aiSummary: '宏观摘要',
};

const collections = [
  { id: '1', title: '前端', description: '浏览器与框架' },
  { id: '2', title: '待读' },
];

function text(messages: { role: string; content: string }[], index = 1): string {
  return messages[index]?.content ?? '';
}

describe('粗读：截断位置与指令', () => {
  it('正文在 3000 字处截断，字数与截断标记一致', () => {
    const long = '长'.repeat(3200);
    const measured = measureQuickTriageContent({ title: '标题', fullContent: long });

    expect(measured.totalWordCount).toBe(3200);
    expect(measured.isTruncated).toBe(true);
    expect(measured.contentToSend).toHaveLength(3000);
    expect(measured.contentToSend).toBe(long.slice(0, 3000));
  });

  it('恰好 3000 字不算截断', () => {
    const measured = measureQuickTriageContent({ title: '标题', fullContent: '长'.repeat(3000) });

    expect(measured.isTruncated).toBe(false);
    expect(measured.contentToSend).toHaveLength(3000);
  });

  it('截断时提示词里出现字数提示与「前 3000 字粗读截选」', () => {
    const messages = buildQuickTriageMessages(
      { title: '标题', fullContent: '长'.repeat(3200) },
      settings()
    );
    const prompt = text(messages);

    expect(prompt).toContain('正文共 3200 字，粗读仅截取前 3000 字');
    expect(prompt).toContain('前 3000 字粗读截选');
    expect(prompt).toContain('长'.repeat(3000));
    expect(prompt).not.toContain('长'.repeat(3001));
  });

  it('自定义指令优先于默认模板，且会 trim', () => {
    const custom = '  只做自定义判断  ';
    const messages = buildQuickTriageMessages(article, settings({ customTriagePrompt: custom }));

    expect(messages[0]?.content).toContain('只做自定义判断');
    expect(messages[0]?.content).not.toContain(DEFAULT_TRIAGE_PROMPT.slice(0, 20));
  });

  it('自定义指令为空白时回退默认模板', () => {
    const messages = buildQuickTriageMessages(article, settings({ customTriagePrompt: '   ' }));

    expect(messages[0]?.content).toContain(DEFAULT_TRIAGE_PROMPT);
  });
});

describe('resolveCategorizeConfig：单篇与批量的差异是刻意保留的', () => {
  it('标签数上限被夹到 1~5', () => {
    expect(resolveCategorizeConfig(settings(), { maxTagCount: 9 }).maxTagCount).toBe(5);
    expect(resolveCategorizeConfig(settings(), { maxTagCount: 0 }).maxTagCount).toBe(1);
  });

  it('单篇用 || 2：设置值为 0 时回落到 2', () => {
    expect(resolveCategorizeConfig(settings({ maxTagCount: 0 })).maxTagCount).toBe(2);
  });

  it('批量用 ?? 2：设置值为 0 时不会回落到 2，而是夹到 1', () => {
    expect(resolveBatchCategorizeConfig(settings({ maxTagCount: 0 })).maxTagCount).toBe(1);
  });

  it('字符串数组形式的 options 被当作现有标签池', () => {
    const config = resolveCategorizeConfig(settings(), ['前端', '架构']);

    expect(config.existingTags).toEqual(['前端', '架构']);
    expect(config.batchTaxonomy).toEqual([]);
  });

  it('对象形式可注入批次标签库与描述开关', () => {
    const config = resolveCategorizeConfig(settings(), {
      batchTaxonomy: ['前端架构'],
      maxTagCount: 3,
      allowModifyDescription: false,
    });

    expect(config).toMatchObject({
      batchTaxonomy: ['前端架构'],
      maxTagCount: 3,
      allowModifyDescription: false,
    });
    expect(config.instruction).toBe(DEFAULT_CATEGORIZE_PROMPT);
  });
});

describe('单篇分类：标签上限、备选收藏夹、描述开关', () => {
  it('标签上限写进硬性约束与 JSON schema', () => {
    const config = resolveCategorizeConfig(settings(), { maxTagCount: 3 });
    const messages = buildCategorizeMessages(article, collections, config);

    expect(messages[0]?.content).toContain('严格输出最多 3 个标签');
    expect(text(messages)).toContain('"tags": ["核心标签1", "核心标签2", "核心标签3"]');
  });

  it('备选收藏夹列表含描述与无说明兜底', () => {
    const messages = buildCategorizeMessages(article, collections, resolveCategorizeConfig(settings()));

    expect(text(messages)).toContain('- 「前端」: 浏览器与框架');
    expect(text(messages)).toContain('- 「待读」: 无具体说明');
  });

  it('allowModifyDescription 决定 schema 里有没有 summary 字段', () => {
    const withSummary = buildCategorizeMessages(
      article,
      collections,
      resolveCategorizeConfig(settings(), { allowModifyDescription: true })
    );
    const without = buildCategorizeMessages(
      article,
      collections,
      resolveCategorizeConfig(settings(), { allowModifyDescription: false })
    );

    expect(text(withSummary)).toContain('"summary": "80字以内的文章精炼主旨描述"');
    expect(text(without)).not.toContain('"summary"');
    expect(without[0]?.content).toContain('3. 描述保持：本次无需修改摘要描述；');
  });

  it('有批次标签库时强制从池中选，不再展示高频标签池', () => {
    const config = resolveCategorizeConfig(settings(), {
      batchTaxonomy: ['前端架构', '性能优化'],
      existingTags: ['旧标签'],
    });
    const messages = buildCategorizeMessages(article, collections, config);

    expect(messages[0]?.content).toContain('全局标签库强制对齐');
    expect(text(messages)).toContain('前端架构、性能优化');
    expect(text(messages)).not.toContain('旧标签');
  });

  it('正文参考截选限制在 1500 字', () => {
    const messages = buildCategorizeMessages(
      { ...article, fullContent: 'x'.repeat(2000) },
      collections,
      resolveCategorizeConfig(settings())
    );

    expect(text(messages)).toContain('x'.repeat(1500));
    expect(text(messages)).not.toContain('x'.repeat(1501));
  });
});

describe('整批单次打标：标签池按批次注入、每篇带 id', () => {
  const batch = [
    { id: 'c1_100', title: '第一篇', aiSummary: '摘要一' },
    { id: 'c2_200', title: '第二篇', aiSummary: '摘要二' },
  ];

  it('每篇都有条目编号与 ID', () => {
    const config = resolveBatchCategorizeConfig(settings(), { batchTaxonomy: ['前端架构'] });
    const prompt = text(buildBatchCategorizeMessages(batch, collections, config));

    expect(prompt).toContain('[条目 1] ID: c1_100');
    expect(prompt).toContain('[条目 2] ID: c2_200');
    expect(prompt).toContain('共 2 篇');
  });

  it('标签池同时注入 system 与 user', () => {
    const config = resolveBatchCategorizeConfig(settings(), { batchTaxonomy: ['前端架构', '性能优化'] });
    const messages = buildBatchCategorizeMessages(batch, collections, config);

    expect(messages[0]?.content).toContain('前端架构、性能优化');
    expect(text(messages)).toContain('前端架构、性能优化');
  });

  it('标签池为空时给出初始词条与通用词条占位', () => {
    const messages = buildBatchCategorizeMessages(batch, collections, resolveBatchCategorizeConfig(settings()));

    expect(messages[0]?.content).toContain('（请按行业一级标准建立初始词条）');
    expect(text(messages)).toContain('（通用标准词条）');
  });

  it('关闭描述时 schema 不含 summary', () => {
    const config = resolveBatchCategorizeConfig(settings(), { allowModifyDescription: false });
    const messages = buildBatchCategorizeMessages(batch, collections, config);

    expect(text(messages)).not.toContain('"summary"');
    expect(messages[0]?.content).toContain('4. 描述保持');
  });

  it('标签上限同样写进批量 schema', () => {
    const config = resolveBatchCategorizeConfig(settings(), { maxTagCount: 3 });
    const prompt = text(buildBatchCategorizeMessages(batch, collections, config));

    expect(prompt).toContain('"tags": ["核心标签1", "核心标签2", "核心标签3"]');
  });
});

describe('精读：全文不截断 + 热评注入', () => {
  it('5000 字全文完整进入提示词', () => {
    const long = '深'.repeat(5000);
    const messages = buildDeepReadMessages({ title: '标题', fullContent: long }, []);
    const prompt = text(messages);

    expect(prompt).toContain('共 5000 字');
    expect(prompt).toContain(long);
    expect(prompt).not.toContain('截选');
  });

  it('热评按序编号注入 Top 5', () => {
    const hot = ['一', '二', '三', '四', '五'];
    const prompt = text(buildDeepReadMessages(article, hot));

    expect(prompt).toContain('1. 一\n2. 二\n3. 三\n4. 四\n5. 五');
  });

  it('无热评时给出占位文案', () => {
    const prompt = text(buildDeepReadMessages(article, []));

    expect(prompt).toContain('（暂无热评或未开启评论区）');
  });
});

describe('全局聚类与收藏夹简介', () => {
  it('adaptive 开关改变标签总数约束措辞', () => {
    const fixed = resolveTaxonomyConfig(settings(), { maxGlobalTags: 4, adaptiveGlobalTags: false });
    const adaptive = resolveTaxonomyConfig(settings(), { maxGlobalTags: 4, adaptiveGlobalTags: true });

    expect(buildTaxonomyMessages([article], fixed)[0]?.content).toContain('【严格输出最多 4 个总标签】');
    expect(buildTaxonomyMessages([article], adaptive)[0]?.content).toContain('自适应提炼');
  });

  it('自定义分类指导注入 user 提示词', () => {
    const config = resolveTaxonomyConfig(settings(), { customPrompt: '优先用已有词' });
    const prompt = text(buildTaxonomyMessages([article], config));

    expect(prompt).toContain('【用户自定义分类指导要求】');
    expect(prompt).toContain('优先用已有词');
  });

  it('收藏夹简介最多取 15 篇、每篇正文 200 字并压平空白', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      title: `标题${i}`,
      fullContent: 'a \n b'.repeat(100),
    }));
    const prompt = text(buildCollectionDescriptionMessages(many));

    expect(prompt).toContain('标题14');
    expect(prompt).not.toContain('标题15');
    expect(prompt).not.toContain('\n  正文摘要: a \n b');
  });
});
