import type { AISettings, ZhihuArticleItem, ZhihuCollection } from '../db';
import type { AIQueueState, AIQueueTask } from './aiQueue';

export type QueueMode = AIQueueTask['mode'];

export interface BatchCategorizeOutcome {
  tags: string[];
  recommendedCategory: string;
  categorizeReason?: string;
  summary?: string;
}

export interface TaxonomyOptions {
  maxGlobalTags?: number;
  adaptiveGlobalTags?: boolean;
  customPrompt?: string;
}

export interface BatchCategorizeOptions {
  batchTaxonomy?: string[];
  maxTagCount?: number;
  allowModifyDescription?: boolean;
}

/**
 * 队列引擎的全部外部依赖。引擎本身不 import Dexie、不 import ai.ts、不读 localStorage，
 * 因此可以在 fake ports 下测试暂停、熔断与分片（ticket 07）。
 */
export interface QueueEngineDeps {
  /** 每次运行前读取，设置可能被用户中途修改 */
  loadSettings(): Promise<AISettings>;
  collections: ZhihuCollection[];
  /** 单篇推进（粗读 / 精读） */
  analyzeSingle(article: ZhihuArticleItem, mode: QueueMode): Promise<void>;
  loadArticle(id: string): Promise<ZhihuArticleItem | undefined>;
  loadArticles(ids: string[]): Promise<ZhihuArticleItem[]>;
  updateArticle(id: string, patch: Partial<ZhihuArticleItem>): Promise<void>;
  synthesizeTaxonomy(articles: ZhihuArticleItem[], options: TaxonomyOptions): Promise<string[]>;
  batchCategorize(
    articles: ZhihuArticleItem[],
    collections: ZhihuCollection[],
    options: BatchCategorizeOptions
  ): Promise<Map<string, BatchCategorizeOutcome>>;
  notify(message: string): void;
  /** UI 更新 + 持久化，由调用方决定实现 */
  commit(state: AIQueueState): void;
  now(): number;
  sleep(ms: number): Promise<void>;
  log?(message: string, error?: unknown): void;
}

const CHUNK_DELAY_MS = 300;
const CIRCUIT_BREAK_THRESHOLD = 3;

export function resolveChunkSize(settings: AISettings, mode: QueueMode): number {
  let size = 20;
  if (mode === 'quick') size = settings.batchLimitQuick || 30;
  else if (mode === 'categorize') size = settings.batchLimitCategorize || 20;
  else if (mode === 'deep') size = settings.batchLimitDeep || 10;
  return Math.max(1, size);
}

/**
 * 队列执行器：按模式分片推进任务，支持暂停与连续失败熔断。
 *
 * 行为契约（与抽取前的 Dashboard.runQueueLoop 一致）：
 * - 已 `done` 的任务跳过；
 * - 每个分片/单篇推进前提交一次「进行中」状态，结束后提交一次结果状态；
 * - 连续 3 次调用失败自动转为暂停，并发出提示；
 * - 暂停后不再写入，最后的提交内容就是暂停态。
 */
export class QueueEngine {
  private readonly deps: QueueEngineDeps;
  private state: AIQueueState;
  private paused = false;
  private running = false;
  private listeners = new Set<(state: AIQueueState) => void>();

  constructor(deps: QueueEngineDeps, initialState?: AIQueueState) {
    this.deps = deps;
    this.state = initialState ?? { status: 'idle', mode: 'quick', tasks: [] };
  }

  /** 订阅状态变化，返回取消订阅函数 */
  subscribe(listener: (state: AIQueueState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 启动一批任务 */
  start(tasks: AIQueueTask[], mode: QueueMode): Promise<AIQueueState> {
    return this.run(tasks, mode);
  }

  /** 从暂停点继续：已完成任务会被跳过，失败任务保持失败直到显式重试 */
  resume(): Promise<AIQueueState> {
    return this.run(this.state.tasks, this.state.mode);
  }

  /** 清空队列并回到 idle */
  clear(): void {
    this.paused = true;
    this.commit({ status: 'idle', mode: this.state.mode, tasks: [] });
  }

  /** 把所有失败项重置为待处理并继续推进 */
  retryFailed(): Promise<AIQueueState> {
    const hasFailed = this.state.tasks.some((t) => t.status === 'failed');
    if (!hasFailed) return Promise.resolve(this.state);

    const tasks = this.state.tasks.map((t) =>
      t.status === 'failed' ? { ...t, status: 'pending' as const, error: undefined } : t
    );
    this.commit({ ...this.state, tasks });
    return this.run(tasks, this.state.mode);
  }

  /** 请求暂停：当前分片/单篇结束后停止，不再发起新调用 */
  pause(): void {
    this.paused = true;
  }

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getState(): AIQueueState {
    return this.state;
  }

  async run(tasksList: AIQueueTask[], mode: QueueMode): Promise<AIQueueState> {
    if (this.running) return this.state;
    this.running = true;
    this.paused = false;

    const tasks = tasksList.map((t) => ({ ...t }));
    let consecutiveErrors = 0;
    const settings = await this.deps.loadSettings();
    const chunkSize = resolveChunkSize(settings, mode);
    const totalChunks = Math.max(1, Math.ceil(tasks.length / chunkSize));
    let taxonomy = this.state.synthesizedTaxonomy ?? [];

    try {
      if (mode === 'categorize') {
        for (let c = 0; c < tasks.length; c += chunkSize) {
          if (this.paused) break;

          const chunkTasks = tasks.slice(c, c + chunkSize);
          const pendingChunkTasks = chunkTasks.filter((t) => t.status !== 'done');
          if (pendingChunkTasks.length === 0) continue;

          const currentChunkNum = Math.floor(c / chunkSize) + 1;
          const chunkInfo = { currentChunk: currentChunkNum, totalChunks, chunkSize };

          pendingChunkTasks.forEach((t) => {
            t.status = 'processing';
            t.updatedAt = this.deps.now();
          });

          this.commit({
            status: 'running',
            mode,
            tasks,
            currentTitle: `第 ${currentChunkNum}/${totalChunks} 批 (${pendingChunkTasks.length} 篇打包极速打标中...)`,
            chunkInfo,
            synthesizedTaxonomy: taxonomy,
          });

          try {
            const chunkIds = pendingChunkTasks.map((t) => t.articleId);
            const chunkArticles = await this.deps.loadArticles(chunkIds);

            if (chunkArticles.length > 0) {
              if (taxonomy.length === 0 || c % (chunkSize * 2) === 0) {
                this.deps.notify(`🏷️ [分批 ${currentChunkNum}/${totalChunks}] 正在提炼本批全局收敛标签...`);
                taxonomy = await this.deps.synthesizeTaxonomy(chunkArticles, {
                  maxGlobalTags: settings.maxGlobalTags,
                  adaptiveGlobalTags: settings.adaptiveGlobalTags,
                  customPrompt: settings.customCategorizePrompt,
                });
              }

              this.deps.notify(
                `⚡ [分批 ${currentChunkNum}/${totalChunks}] 正在 1 次请求中打包完成 ${chunkArticles.length} 篇分类与归属...`
              );
              const resultMap = await this.deps.batchCategorize(chunkArticles, this.deps.collections, {
                batchTaxonomy: taxonomy,
                maxTagCount: settings.maxTagCount,
                allowModifyDescription: settings.allowModifyDescription,
              });

              const allowModifyTags = settings.allowModifyTags ?? true;
              const allowModifyDesc = settings.allowModifyDescription ?? true;
              const maxTagCount = settings.maxTagCount || 2;

              for (const art of chunkArticles) {
                const res = resultMap.get(art.id);
                if (!res) continue;

                const keepExistingTags = !allowModifyTags && !!art.tags && art.tags.length > 0;
                const patch: Partial<ZhihuArticleItem> = {
                  aiCategory: res.recommendedCategory,
                  aiCategoryReason: res.categorizeReason,
                  aiClassifiedAt: this.deps.now(),
                };
                if (!keepExistingTags) patch.tags = res.tags.slice(0, maxTagCount);
                if (allowModifyDesc && res.summary) patch.aiSummary = res.summary;

                await this.deps.updateArticle(art.id, patch);
              }

              pendingChunkTasks.forEach((t) => {
                t.status = 'done';
                t.updatedAt = this.deps.now();
              });
              consecutiveErrors = 0;
            } else {
              pendingChunkTasks.forEach((t) => {
                t.status = 'failed';
                t.error = '文章不存在或已在知乎失效';
                t.updatedAt = this.deps.now();
              });
            }
          } catch (err) {
            this.deps.log?.('整批分类任务处理异常', err);
            const message = err instanceof Error ? err.message : '批处理失败';
            pendingChunkTasks.forEach((t) => {
              t.status = 'failed';
              t.error = message;
              t.updatedAt = this.deps.now();
            });
            consecutiveErrors += 1;

            if (consecutiveErrors >= CIRCUIT_BREAK_THRESHOLD) {
              this.paused = true;
              this.deps.notify(`⚠️ 接口连续调用异常 [${pendingChunkTasks[0]?.error}]，队列已自动暂停保护！`);
            }
          }

          this.commitStep(mode, tasks, chunkInfo, taxonomy);

          if (this.paused) break;
          if (c + chunkSize < tasks.length) await this.deps.sleep(CHUNK_DELAY_MS);
        }
      } else {
        for (let i = 0; i < tasks.length; i++) {
          if (this.paused) break;

          const task = tasks[i];
          if (!task) continue;
          if (task.status === 'done') continue;

          const currentChunkNum = Math.floor(i / chunkSize) + 1;
          const chunkInfo = { currentChunk: currentChunkNum, totalChunks, chunkSize };

          task.status = 'processing';
          task.updatedAt = this.deps.now();

          this.commit({
            status: 'running',
            mode,
            tasks,
            currentTitle: task.title,
            currentArticleId: task.articleId,
            chunkInfo,
          });

          try {
            const article = await this.deps.loadArticle(task.articleId);
            if (!article) {
              task.status = 'failed';
              task.error = '文章不存在或已在知乎失效';
            } else {
              await this.deps.analyzeSingle(article, task.mode);
              task.status = 'done';
              consecutiveErrors = 0;
            }
          } catch (err) {
            this.deps.log?.('AI 队列处理任务失败', err);
            task.status = 'failed';
            task.error = err instanceof Error ? err.message : '分析失败';
            consecutiveErrors += 1;

            if (consecutiveErrors >= CIRCUIT_BREAK_THRESHOLD) {
              this.paused = true;
              this.deps.notify(`⚠️ 接口连续调用异常 [${task.error}]，队列已自动暂停保护！`);
            }
          }

          task.updatedAt = this.deps.now();
          this.commitStep(mode, tasks, chunkInfo, taxonomy);

          if (this.paused) break;
          if (i < tasks.length - 1) await this.deps.sleep(CHUNK_DELAY_MS);
        }
      }
    } finally {
      this.running = false;
    }

    return this.state;
  }

  private commitStep(
    mode: QueueMode,
    tasks: AIQueueTask[],
    chunkInfo: AIQueueState['chunkInfo'],
    taxonomy?: string[]
  ): void {
    const hasPending = tasks.some((t) => t.status === 'pending');
    const status: AIQueueState['status'] = this.paused
      ? 'paused'
      : hasPending
        ? 'running'
        : 'completed';

    this.commit({
      status,
      mode,
      tasks,
      currentTitle: undefined,
      currentArticleId: undefined,
      chunkInfo,
      synthesizedTaxonomy: taxonomy,
    });
  }

  private commit(state: AIQueueState): void {
    this.state = { ...state, tasks: state.tasks.map((t) => ({ ...t })) };
    this.deps.commit(this.state);
    this.listeners.forEach((listener) => listener(this.state));
  }
}

export function createQueueEngine(deps: QueueEngineDeps, initialState?: AIQueueState): QueueEngine {
  return new QueueEngine(deps, initialState);
}
