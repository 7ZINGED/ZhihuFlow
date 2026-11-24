import { describe, expect, it } from 'vitest';
import type { AIQueueState } from './aiQueue';
import { isModeCompleted, reconcileQueueWithProgress } from './queueReconcile';

function task(
  id: string,
  status: 'pending' | 'processing' | 'done' | 'failed',
  mode: 'quick' | 'categorize' | 'deep' = 'quick'
) {
  return { articleId: id, title: `文章 ${id}`, mode, status, updatedAt: 1 };
}

function state(
  tasks: ReturnType<typeof task>[],
  status: AIQueueState['status'] = 'paused',
  mode: AIQueueState['mode'] = 'quick'
): AIQueueState {
  return { status, mode, tasks };
}

describe('完成判定按模式取字段', () => {
  it('quick 只看 aiTriageRating', () => {
    expect(isModeCompleted({ id: 'a', aiTriageRating: 'keep' }, 'quick')).toBe(true);
    expect(isModeCompleted({ id: 'a' }, 'quick')).toBe(false);
  });

  it('categorize 只看 aiClassifiedAt，手工标签不算完成', () => {
    expect(isModeCompleted({ id: 'a', aiClassifiedAt: 1 }, 'categorize')).toBe(true);
    expect(isModeCompleted({ id: 'a' }, 'categorize')).toBe(false);
  });

  it('deep 只看 aiDeepReadAt', () => {
    expect(isModeCompleted({ id: 'a', aiDeepReadAt: 1 }, 'deep')).toBe(true);
    expect(isModeCompleted({ id: 'a', aiClassifiedAt: 1 }, 'deep')).toBe(false);
  });
});

describe('队列对账', () => {
  it('文章已写但任务仍是 pending 时补标 done', () => {
    const result = reconcileQueueWithProgress(state([task('a', 'pending'), task('b', 'pending')]), [
      { id: 'a', aiTriageRating: 'keep' },
    ]);

    expect(result.recovered).toBe(1);
    expect(result.state.tasks.map((t) => t.status)).toEqual(['done', 'pending']);
    expect(result.state.status).toBe('paused');
  });

  it('processing 一律退回 pending', () => {
    const result = reconcileQueueWithProgress(state([task('a', 'processing')], 'running'), []);

    expect(result.state.tasks[0].status).toBe('pending');
    expect(result.recovered).toBe(0);
  });

  it('done 但文章缺字段时保持 done，不自动回退', () => {
    const result = reconcileQueueWithProgress(state([task('a', 'done')]), [{ id: 'a' }]);

    expect(result.state.tasks[0].status).toBe('done');
    expect(result.unverified).toBe(1);
    expect(result.recovered).toBe(0);
  });

  it('对账后无未完成任务则转为 completed 并清空游标', () => {
    const result = reconcileQueueWithProgress(
      { ...state([task('a', 'pending')]), currentTitle: '正在处理', currentArticleId: 'a' },
      [{ id: 'a', aiTriageRating: 'review' }]
    );

    expect(result.state.status).toBe('completed');
    expect(result.state.currentTitle).toBeUndefined();
    expect(result.state.currentArticleId).toBeUndefined();
  });

  it('无需修正时返回原对象，避免无谓落盘', () => {
    const original = state([task('a', 'done'), task('b', 'pending')]);
    const result = reconcileQueueWithProgress(original, [
      { id: 'a', aiTriageRating: 'keep' },
      { id: 'b' },
    ]);

    expect(result.recovered).toBe(0);
    expect(result.state).toBe(original);
  });

  it('分类模式下按 aiClassifiedAt 补标，不因已有标签误判', () => {
    const tasks = [task('a', 'pending', 'categorize'), task('b', 'pending', 'categorize')];
    const result = reconcileQueueWithProgress(state(tasks, 'paused', 'categorize'), [
      { id: 'a', aiClassifiedAt: 100 },
      { id: 'b' },
    ]);

    expect(result.state.tasks.map((t) => t.status)).toEqual(['done', 'pending']);
  });

  it('队列为空时原样返回', () => {
    const original = state([]);
    const result = reconcileQueueWithProgress(original, [{ id: 'a', aiTriageRating: 'keep' }]);

    expect(result.state).toBe(original);
  });
});
