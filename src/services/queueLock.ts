/**
 * 队列单写者锁（ADR-0004 决策第 4 条）。
 *
 * 用 Web Locks 保证同一时刻只有一个标签页推进 AI 队列，避免重复消耗 API 额度
 * 与 localStorage 后写覆盖。锁在标签页关闭时由浏览器自动释放，因此暂停时不主动
 * 释放（该标签页仍持有队列），清空队列与循环结束时释放。
 */

const LOCK_NAME = 'zhihuflow-ai-queue';

let releaseCurrent: (() => void) | null = null;
let warnedNoSupport = false;

export function isQueueLockSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { locks?: LockManager }).locks?.request === 'function'
  );
}

/**
 * 尝试获取队列所有权。已由本页持有时直接返回 true。
 * 返回 false 表示另一个标签页正在运行队列。
 * 环境不支持 Web Locks 时降级为放行，并在控制台告警一次。
 */
export async function acquireQueueLock(): Promise<boolean> {
  if (releaseCurrent) return true;

  if (!isQueueLockSupported()) {
    if (!warnedNoSupport) {
      warnedNoSupport = true;
      console.warn('[queueLock] Web Locks 不可用，跳过单写者保护；请勿在多个标签页同时运行队列。');
    }
    return true;
  }

  const holder: { release: (() => void) | null } = { release: null };

  const acquired = await new Promise<boolean>((resolve) => {
    void navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>((release) => {
        holder.release = release;
      });
    });
  });

  if (acquired && holder.release) {
    releaseCurrent = holder.release;
    return true;
  }
  return acquired;
}

/** 释放本页持有的队列所有权；未持有时为空操作。释放到真正可用之间有一次事件循环延迟。 */
export function releaseQueueLock(): void {
  const release = releaseCurrent;
  releaseCurrent = null;
  release?.();
}

/** 仅用于测试：重置模块内状态。 */
export function __resetQueueLockForTest(): void {
  releaseCurrent = null;
  warnedNoSupport = false;
}
