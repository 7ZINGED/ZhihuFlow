export interface AIQueueTask {
  articleId: string;
  title: string;
  mode: 'quick' | 'deep';
  status: 'pending' | 'processing' | 'done' | 'failed';
  error?: string;
  updatedAt: number;
}

export interface AIQueueState {
  status: 'idle' | 'running' | 'paused' | 'completed';
  mode: 'quick' | 'deep';
  tasks: AIQueueTask[];
  currentTitle?: string;
  currentArticleId?: string;
}

const STORAGE_KEY = 'zh_ai_batch_queue_v1';

/**
 * 从本地持久化存储加载 AI 任务队列状态
 * 刷新页面时若处于 running 状态，自动安全转为 paused 状态，防止后台失控并完整保留任务队列
 */
export function loadQueueFromStorage(): AIQueueState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { status: 'idle', mode: 'quick', tasks: [] };
    }
    const parsed: AIQueueState = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) {
      return { status: 'idle', mode: 'quick', tasks: [] };
    }

    // 若刷新前正在运行，恢复为暂停状态，让用户明确可点击「继续」无缝续跑
    if (parsed.status === 'running') {
      parsed.status = 'paused';
      parsed.tasks = parsed.tasks.map((t) =>
        t.status === 'processing' ? { ...t, status: 'pending' } : t
      );
      parsed.currentTitle = undefined;
      parsed.currentArticleId = undefined;
    }

    // 若全部任务都已完成，标记为 completed
    const hasPending = parsed.tasks.some(
      (t) => t.status === 'pending' || t.status === 'processing'
    );
    if (!hasPending && parsed.tasks.length > 0 && parsed.status !== 'idle') {
      parsed.status = 'completed';
    }

    return parsed;
  } catch (e) {
    console.error('Failed to load AI queue from storage:', e);
    return { status: 'idle', mode: 'quick', tasks: [] };
  }
}

/**
 * 将队列状态保存到 localStorage（保障跨刷新、跨会话不丢失）
 */
export function saveQueueToStorage(state: AIQueueState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save AI queue to storage:', e);
  }
}

/**
 * 清除已保存的 AI 队列
 */
export function clearQueueStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear AI queue storage:', e);
  }
}
