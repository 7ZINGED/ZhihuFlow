import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  batchCategorizeArticlesWithAI,
  categorizeArticleWithAI,
  deepReadArticleWithAI,
  generateCollectionDescription,
  quickTriageArticleWithAI,
  synthesizeBatchTaxonomy,
} from './ai';

/**
 * 提示词搬移的守护测试（ticket 11）。
 *
 * 这里不直接测 aiPrompts.ts，而是通过 fake fetch 抓取实际发出的请求体，
 * 证明「搬移前后发给模型的 messages 逐字一致」。搬移完成后本文件不应改动。
 */

const SETTINGS = {
  endpoint: 'https://api.example.com/v1',
  model: 'test-model',
  apiKey: 'test-key',
  customTriagePrompt: '',
  customCategorizePrompt: '',
  maxTagCount: 2,
  allowModifyDescription: true,
  maxGlobalTags: 8,
  adaptiveGlobalTags: true,
};

const article = {
  id: 'c1_100',
  title: '如何理解事件循环',
  authorName: '张三',
  voteupCount: 1234,
  commentCount: 56,
  collectionTitle: '技术',
  fullContent: '这是一段用于快照的正文内容。'.repeat(20),
  aiSummary: '事件循环的宏观摘要',
  aiKeyTakeaways: ['要点一', '要点二'],
  aiCommentsInsight: '评论区对宏任务顺序有争议',
};

const collections = [
  { id: '1', title: '前端', description: '浏览器与框架' },
  { id: '2', title: '待读' },
];

let replies: string[] = [];
let requests: Array<{ messages: { role: string; content: string }[] }> = [];

beforeEach(() => {
  replies = [];
  requests = [];

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async () => ({ ai_settings: SETTINGS }),
        set: async () => undefined,
      },
    },
  });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init: { body?: string }) => {
      requests.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: replies.shift() ?? '{}' } }],
        }),
        { status: 200 }
      );
    })
  );
});

function reply(value: unknown): void {
  replies = [typeof value === 'string' ? value : JSON.stringify(value)];
}

async function sentMessages(invoke: () => Promise<unknown>) {
  try {
    await invoke();
  } catch {
    // 只关心请求体；解析失败或兜底路径不影响第一条请求的快照
  }
  return requests[0]?.messages;
}

describe('提示词逐字快照（搬移守护）', () => {
  it('粗读：短正文', async () => {
    reply({ summary: 's', keyTakeaways: [], triageRating: 'keep', triageReason: 'r' });

    const messages = await sentMessages(() => quickTriageArticleWithAI(article));

    expect(messages).toMatchSnapshot();
  });

  it('粗读：超 3000 字触发截断提示', async () => {
    reply({ summary: 's', keyTakeaways: [], triageRating: 'keep', triageReason: 'r' });

    const messages = await sentMessages(() =>
      quickTriageArticleWithAI({ ...article, fullContent: '长'.repeat(3200) })
    );

    expect(messages).toMatchSnapshot();
  });

  it('粗读：自定义指令覆盖默认模板', async () => {
    reply({ summary: 's', keyTakeaways: [], triageRating: 'keep', triageReason: 'r' });
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async () => ({ ai_settings: { ...SETTINGS, customTriagePrompt: '  只做自定义判断  ' } }),
          set: async () => undefined,
        },
      },
    });

    const messages = await sentMessages(() => quickTriageArticleWithAI(article));

    expect(messages).toMatchSnapshot();
  });

  it('全局聚类 Pass 1', async () => {
    reply(['前端架构']);

    const messages = await sentMessages(() =>
      synthesizeBatchTaxonomy([article], { maxGlobalTags: 4, adaptiveGlobalTags: false, customPrompt: '优先用已有词' })
    );

    expect(messages).toMatchSnapshot();
  });

  it('词条分类：带标签池与描述字段', async () => {
    reply({ tags: ['前端'], recommendedCategory: '前端', categorizeReason: 'r', summary: 's' });

    const messages = await sentMessages(() =>
      categorizeArticleWithAI(article, collections, {
        existingTags: ['前端', '架构'],
        batchTaxonomy: [],
        maxTagCount: 2,
        allowModifyDescription: true,
      })
    );

    expect(messages).toMatchSnapshot();
  });

  it('词条分类：关闭描述、注入批次标签库', async () => {
    reply({ tags: ['前端'], recommendedCategory: '前端', categorizeReason: 'r' });

    const messages = await sentMessages(() =>
      categorizeArticleWithAI(article, collections, {
        batchTaxonomy: ['前端架构', '性能优化'],
        maxTagCount: 3,
        allowModifyDescription: false,
      })
    );

    expect(messages).toMatchSnapshot();
  });

  it('整批单次打标 Pass 2', async () => {
    reply([
      { id: 'c1_100', tags: ['前端'], recommendedCategory: '前端', categorizeReason: 'r', summary: 's' },
      { id: 'c2_200', tags: ['待读'], recommendedCategory: '待读', categorizeReason: 'r', summary: 's' },
    ]);

    const messages = await sentMessages(() =>
      batchCategorizeArticlesWithAI(
        [article, { ...article, id: 'c2_200', title: '第二篇', aiSummary: '第二篇摘要' }],
        collections,
        { batchTaxonomy: ['前端架构', '性能优化'], maxTagCount: 2, allowModifyDescription: true }
      )
    );

    expect(messages).toMatchSnapshot();
  });

  it('精读：全文 + 热评 Top 5', async () => {
    reply({ summary: 's', keyTakeaways: [], commentsInsight: 'i' });

    const messages = await sentMessages(() =>
      deepReadArticleWithAI(article, ['热评一', '热评二', '热评三'])
    );

    expect(messages).toMatchSnapshot();
  });

  it('收藏夹简介生成', async () => {
    reply('一段宏观描述');

    const messages = await sentMessages(() => generateCollectionDescription([article]));

    expect(messages).toMatchSnapshot();
  });
});
