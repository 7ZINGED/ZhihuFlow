import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetQueueLockForTest,
  acquireQueueLock,
  isQueueLockSupported,
  releaseQueueLock,
} from './queueLock';

/** 最小 LockManager 替身：记录持有者，支持 ifAvailable 语义 */
function installFakeLocks(initiallyHeld: string[] = []) {
  const held = new Set(initiallyHeld);

  const fake = {
    async request(
      name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: { name: string } | null) => unknown
    ) {
      if (held.has(name)) {
        if (options?.ifAvailable) return callback(null);
        throw new Error('lock already held');
      }
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };

  Object.defineProperty(navigator, 'locks', { value: fake, configurable: true });
  return held;
}

beforeEach(() => {
  __resetQueueLockForTest();
  vi.restoreAllMocks();
  // 默认清掉替身，让各用例自行安装
  Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
});

describe('队列单写者锁', () => {
  it('首次获取成功，重复获取在本页内保持成功', async () => {
    installFakeLocks();

    expect(await acquireQueueLock()).toBe(true);
    expect(await acquireQueueLock()).toBe(true);
  });

  it('另一个标签页持有时返回 false', async () => {
    installFakeLocks(['zhihuflow-ai-queue']);

    expect(await acquireQueueLock()).toBe(false);
  });

  it('释放后可以被重新获取', async () => {
    installFakeLocks();

    expect(await acquireQueueLock()).toBe(true);
    releaseQueueLock();
    // 释放是异步生效的（真实 Web Locks 同样如此），让出事件循环后再获取
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await acquireQueueLock()).toBe(true);
  });

  it('环境不支持 Web Locks 时放行且只告警一次', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(isQueueLockSupported()).toBe(false);
    expect(await acquireQueueLock()).toBe(true);
    expect(await acquireQueueLock()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
