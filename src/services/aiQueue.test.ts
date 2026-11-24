import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearQueueStorage,
  loadQueueFromStorage,
  saveQueueToStorage,
  type AIQueueState,
} from './aiQueue';

function emptyState(): AIQueueState {
  return { status: 'idle', mode: 'quick', tasks: [] };
}

function task(id: string, status: 'pending' | 'processing' | 'done' | 'failed') {
  return { articleId: id, title: `文章 ${id}`, mode: 'quick' as const, status, updatedAt: 1 };
}

beforeEach(() => {
  localStorage.clear();
});

describe('AI 队列持久化', () => {
  it('没有存档时返回空队列', () => {
    expect(loadQueueFromStorage()).toEqual(emptyState());
  });

  it('保存后可以原样恢复', () => {
    const state: AIQueueState = {
      status: 'paused',
      mode: 'categorize',
      tasks: [task('a', 'pending'), task('b', 'done')],
      synthesizedTaxonomy: ['前端架构'],
    };

    saveQueueToStorage(state);

    expect(loadQueueFromStorage()).toEqual(state);
  });

  it('刷新时把 running 降级为 paused，并把 processing 退回 pending', () => {
    localStorage.setItem(
      'zh_ai_batch_queue_v1',
      JSON.stringify({
        status: 'running',
        mode: 'deep',
        tasks: [task('a', 'processing'), task('b', 'done')],
        currentTitle: '正在精读',
        currentArticleId: 'a',
      })
    );

    const restored = loadQueueFromStorage();

    expect(restored.status).toBe('paused');
    expect(restored.tasks.map((t) => t.status)).toEqual(['pending', 'done']);
    expect(restored.currentTitle).toBeUndefined();
    expect(restored.currentArticleId).toBeUndefined();
  });

  it('全部任务完成时标记为 completed', () => {
    localStorage.setItem(
      'zh_ai_batch_queue_v1',
      JSON.stringify({ status: 'paused', mode: 'quick', tasks: [task('a', 'done')] })
    );

    expect(loadQueueFromStorage().status).toBe('completed');
  });

  it('损坏的存档安全回退为空队列', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('zh_ai_batch_queue_v1', '{not-json');

    expect(loadQueueFromStorage()).toEqual(emptyState());

    clearQueueStorage();
    expect(localStorage.getItem('zh_ai_batch_queue_v1')).toBeNull();
    errorSpy.mockRestore();
  });
});
