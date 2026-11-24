import type { AIQueueState, AIQueueTask } from './aiQueue';

/**
 * 文章进度投影：只取对账需要的完成字段，避免让队列逻辑依赖整个文章实体。
 * 对应 ADR-0004：文章行是每篇进度的唯一真相。
 */
export interface ArticleProgress {
  id: string;
  aiTriageRating?: 'keep' | 'discard' | 'review' | string;
  aiClassifiedAt?: number;
  aiDeepReadAt?: number;
}

/** 某模式「已完成」的判定字段，见 ADR-0004 决策第 1 条 */
export function isModeCompleted(article: ArticleProgress, mode: AIQueueTask['mode']): boolean {
  switch (mode) {
    case 'quick':
      return Boolean(article.aiTriageRating);
    case 'categorize':
      // 刻意不用 tags：标签可由用户手工填写，aiClassifiedAt 才代表 AI 处理过
      return typeof article.aiClassifiedAt === 'number';
    case 'deep':
      return typeof article.aiDeepReadAt === 'number';
    default:
      return false;
  }
}

export interface ReconcileResult {
  state: AIQueueState;
  /** 依据文章字段补标为 done 的任务数 */
  recovered: number;
  /** 因文章字段缺失而被保持为 done 的任务数（仅用于观测，不改变状态） */
  unverified: number;
}

/**
 * 按文章字段对账队列中的任务状态。
 *
 * 规则（不对称，见 ADR-0004）：
 * - processing → pending：上次运行被中断，必然重跑；
 * - 非 done 且文章已有该模式完成字段 → done：崩溃窗口自愈，省掉重复 AI 调用；
 * - done 但文章缺字段 → 保持 done，不自动回退，避免启动时静默重烧额度；
 * - 对账后无 pending/processing 且有任务 → completed。
 *
 * 纯函数：不读写存储，不调用 AI，便于在端口注入下测试。
 */
export function reconcileQueueWithProgress(
  state: AIQueueState,
  articles: readonly ArticleProgress[]
): ReconcileResult {
  if (state.tasks.length === 0) {
    return { state, recovered: 0, unverified: 0 };
  }

  const byId = new Map(articles.map((a) => [a.id, a]));
  let recovered = 0;
  let unverified = 0;
  let changed = false;

  const tasks = state.tasks.map<AIQueueTask>((task) => {
    const article = byId.get(task.articleId);

    if (task.status === 'processing') {
      changed = true;
      return { ...task, status: 'pending', error: undefined };
    }

    if (!article) return task;

    const completed = isModeCompleted(article, task.mode);

    if (task.status !== 'done' && completed) {
      recovered += 1;
      changed = true;
      return { ...task, status: 'done', error: undefined, updatedAt: Date.now() };
    }

    if (task.status === 'done' && !completed) {
      unverified += 1;
    }

    return task;
  });

  const hasPending = tasks.some((t) => t.status === 'pending' || t.status === 'processing');
  let status = state.status;
  if (!hasPending && status !== 'idle') {
    status = 'completed';
  }
  if (status !== state.status) changed = true;

  if (!changed) {
    return { state, recovered: 0, unverified };
  }

  return {
    state: {
      ...state,
      status,
      tasks,
      currentTitle: status === 'completed' ? undefined : state.currentTitle,
      currentArticleId: status === 'completed' ? undefined : state.currentArticleId,
    },
    recovered,
    unverified,
  };
}
