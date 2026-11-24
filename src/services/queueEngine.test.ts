import { describe, expect, it } from 'vitest';
import type { AISettings, ZhihuArticleItem } from '../db';
import type { AIQueueState, AIQueueTask } from './aiQueue';
import { createQueueEngine, resolveChunkSize, type QueueEngineDeps } from './queueEngine';

const settings = {
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'test',
  apiKey: '',
  batchLimitQuick: 2,
  batchLimitCategorize: 2,
  batchLimitDeep: 1,
  maxTagCount: 2,
  allowModifyTags: true,
  allowModifyDescription: true,
  maxGlobalTags: 8,
} as AISettings;

function article(id: string): ZhihuArticleItem {
  return {
    id,
    contentId: id,
    contentType: 'answer',
    collectionId: 'c1',
    collectionTitle: '收藏夹',
    title: `文章 ${id}`,
    url: `https://example.com/${id}`,
  };
}

function task(id: string, status: AIQueueTask['status'] = 'pending'): AIQueueTask {
  return { articleId: id, title: `文章 ${id}`, mode: 'quick', status, updatedAt: 0 };
}

function harness(overrides: Partial<QueueEngineDeps> = {}) {
  const commits: AIQueueState[] = [];
  const notices: string[] = [];
  const updates: { id: string; patch: Partial<ZhihuArticleItem> }[] = [];
  const store = new Map<string, ZhihuArticleItem>();

  const deps: QueueEngineDeps = {
    loadSettings: async () => settings,
    collections: [],
    analyzeSingle: async () => {},
    loadArticle: async (id) => store.get(id) ?? article(id),
    loadArticles: async (ids) => ids.map((id) => store.get(id) ?? article(id)),
    updateArticle: async (id, patch) => {
      updates.push({ id, patch });
    },
    synthesizeTaxonomy: async () => ['前端架构', '量化金融'],
    batchCategorize: async (articles) =>
      new Map(
        articles.map((a) => [
          a.id,
          { tags: ['前端架构'], recommendedCategory: '技术', categorizeReason: '主题匹配' },
        ])
      ),
    notify: (message) => notices.push(message),
    commit: (state) => commits.push(state),
    now: () => 1000,
    sleep: async () => {},
    ...overrides,
  };

  return { deps, commits, notices, updates, store };
}

describe('resolveChunkSize', () => {
  it('按模式取设置上限，最小为 1', () => {
    expect(resolveChunkSize(settings, 'quick')).toBe(2);
    expect(resolveChunkSize(settings, 'categorize')).toBe(2);
    expect(resolveChunkSize(settings, 'deep')).toBe(1);
    expect(resolveChunkSize({ ...settings, batchLimitDeep: 0 } as AISettings, 'deep')).toBe(10);
  });
});

describe('QueueEngine 单篇模式', () => {
  it('逐篇推进并最终标记 completed', async () => {
    const calls: string[] = [];
    const { deps, commits } = harness({
      analyzeSingle: async (a) => {
        calls.push(a.id);
      },
    });
    const engine = createQueueEngine(deps);

    const final = await engine.run([task('a'), task('b'), task('c')], 'quick');

    expect(calls).toEqual(['a', 'b', 'c']);
    expect(final.status).toBe('completed');
    expect(final.tasks.every((t) => t.status === 'done')).toBe(true);
    expect(commits.at(-1)?.status).toBe('completed');
  });

  it('跳过已完成任务', async () => {
    const calls: string[] = [];
    const { deps } = harness({
      analyzeSingle: async (a) => {
        calls.push(a.id);
      },
    });

    await createQueueEngine(deps).run([task('a', 'done'), task('b')], 'quick');

    expect(calls).toEqual(['b']);
  });

  it('连续 3 次失败自动暂停并提示', async () => {
    const { deps, notices, commits } = harness({
      analyzeSingle: async () => {
        throw new Error('额度不足');
      },
    });
    const engine = createQueueEngine(deps);

    const final = await engine.run([task('a'), task('b'), task('c'), task('d')], 'quick');

    expect(engine.isPaused()).toBe(true);
    expect(final.status).toBe('paused');
    expect(notices.some((n) => n.includes('队列已自动暂停'))).toBe(true);
    expect(commits.at(-1)?.tasks.filter((t) => t.status === 'failed')).toHaveLength(3);
  });

  it('暂停后不再发起新的调用', async () => {
    const calls: string[] = [];
    let engineRef: ReturnType<typeof createQueueEngine>;
    const { deps } = harness({
      analyzeSingle: async (a) => {
        calls.push(a.id);
        engineRef.pause();
      },
    });
    engineRef = createQueueEngine(deps);

    const final = await engineRef.run([task('a'), task('b'), task('c')], 'quick');

    expect(calls).toEqual(['a']);
    expect(final.status).toBe('paused');
  });

  it('文章不存在时标记失败而不是抛错', async () => {
    const { deps } = harness({ loadArticle: async () => undefined });

    const final = await createQueueEngine(deps).run([task('a')], 'quick');

    expect(final.tasks[0]?.status).toBe('failed');
    expect(final.tasks[0]?.error).toBe('文章不存在或已在知乎失效');
  });
});

describe('QueueEngine 分类模式', () => {
  it('按分片整批打标并写回文章字段', async () => {
    const chunkSizes: number[] = [];
    const { deps, updates } = harness({
      batchCategorize: async (articles) => {
        chunkSizes.push(articles.length);
        return new Map(
          articles.map((a) => [
            a.id,
            { tags: ['#前端架构', '超出的第三个标签'], recommendedCategory: '技术', categorizeReason: '主题匹配' },
          ])
        );
      },
    });

    const tasks = ['1', '2', '3', '4', '5'].map((id) => task(id));
    const final = await createQueueEngine(deps).run(tasks, 'categorize');

    expect(chunkSizes).toEqual([2, 2, 1]);
    expect(final.status).toBe('completed');
    expect(updates).toHaveLength(5);
    expect(updates[0]?.patch.aiCategory).toBe('技术');
    expect(updates[0]?.patch.aiClassifiedAt).toBe(1000);
    expect(updates[0]?.patch.tags).toEqual(['#前端架构', '超出的第三个标签']);
  });

  it('标签池注入到批次请求', async () => {
    const seen: (string[] | undefined)[] = [];
    const { deps } = harness({
      synthesizeTaxonomy: async () => ['池标签'],
      batchCategorize: async (_articles, _cols, options) => {
        seen.push(options.batchTaxonomy);
        return new Map();
      },
    });

    await createQueueEngine(deps).run([task('1'), task('2')], 'categorize');

    expect(seen[0]).toEqual(['池标签']);
  });
});

describe('QueueEngine 生命周期', () => {
  it('暂停后 resume 从断点继续，不重跑已完成', async () => {
    const calls: string[] = [];
    let engineRef: ReturnType<typeof createQueueEngine> | null = null;
    let first = true;
    const { deps } = harness({
      analyzeSingle: async (a) => {
        calls.push(a.id);
        if (first) {
          first = false;
          engineRef?.pause();
        }
      },
    });
    engineRef = createQueueEngine(deps);

    const paused = await engineRef.start([task('a'), task('b')], 'quick');
    expect(paused.status).toBe('paused');
    expect(calls).toEqual(['a']);

    const resumed = await engineRef.resume();
    expect(calls).toEqual(['a', 'b']);
    expect(resumed.status).toBe('completed');
  });

  it('retryFailed 只重跑失败项', async () => {
    const calls: string[] = [];
    let shouldFail = true;
    const { deps } = harness({
      analyzeSingle: async (a) => {
        calls.push(a.id);
        if (a.id === 'a' && shouldFail) throw new Error('boom');
      },
    });
    const engine = createQueueEngine(deps);

    await engine.start([task('a'), task('b')], 'quick');
    shouldFail = false;
    const final = await engine.retryFailed();

    expect(calls).toEqual(['a', 'b', 'a']);
    expect(final.status).toBe('completed');
    expect(final.tasks.every((t) => t.status === 'done')).toBe(true);
  });

  it('clear 回到 idle 并清空任务', async () => {
    const { deps, commits } = harness();
    const engine = createQueueEngine(deps);
    await engine.start([task('a')], 'quick');

    engine.clear();

    expect(engine.getState()).toEqual({ status: 'idle', mode: 'quick', tasks: [] });
    expect(commits.at(-1)?.status).toBe('idle');
  });

  it('subscribe 收到每次状态提交', async () => {
    const seen: AIQueueState['status'][] = [];
    const { deps } = harness();
    const engine = createQueueEngine(deps);
    const unsubscribe = engine.subscribe((s) => seen.push(s.status));

    await engine.start([task('a')], 'quick');
    unsubscribe();

    expect(seen).toContain('running');
    expect(seen.at(-1)).toBe('completed');
  });
});
