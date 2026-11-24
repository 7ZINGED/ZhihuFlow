import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCollectionContents, fetchCollectionContentsDetailed } from './zhihuApi';

function jsonResponse(data: unknown, ok = true): Response {
  return { ok, json: async () => data } as Response;
}

/** 主接口按 is_end 分页返回；备用接口返回单页 */
function installFetch(mainPages: unknown[], backup?: unknown) {
  let page = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/items?')) {
      const data = mainPages[Math.min(page, mainPages.length - 1)];
      page += 1;
      return jsonResponse(data);
    }
    if (backup !== undefined) return jsonResponse(backup);
    return jsonResponse({}, false);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal('chrome', {
    cookies: { get: vi.fn(async () => ({ value: 'test-xsrf' })) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchCollectionContentsDetailed 完整性标志', () => {
  it('主接口单页 is_end=true 视为完整', async () => {
    installFetch([{ data: [{ content: { type: 'answer', id: 1 } }], paging: { is_end: true } }]);

    const result = await fetchCollectionContentsDetailed('c1', '收藏夹');

    expect(result.complete).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it('主接口多页走完视为完整', async () => {
    installFetch([
      { data: [{ content: { type: 'answer', id: 1 } }], paging: { is_end: false, next: 'https://www.zhihu.com/api/v4/collections/c1/items?offset=20' } },
      { data: [{ content: { type: 'answer', id: 2 } }], paging: { is_end: true } },
    ]);

    const result = await fetchCollectionContentsDetailed('c1', '收藏夹');

    expect(result.complete).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('备用接口只取第一页，标记为不完整', async () => {
    const fetchMock = installFetch([{}], { data: [{ content: { type: 'answer', id: 1 } }] });
    // 让主接口返回非 ok，触发备用接口
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/items?')) return jsonResponse({}, false);
      return jsonResponse({ data: [{ content: { type: 'answer', id: 1 } }] });
    });

    const result = await fetchCollectionContentsDetailed('c1', '收藏夹');

    expect(result.complete).toBe(false);
    expect(result.items).toHaveLength(1);
  });

  it('响应结构异常标记为不完整', async () => {
    installFetch([{ data: 'unexpected', paging: { is_end: true } }]);

    const result = await fetchCollectionContentsDetailed('c1', '收藏夹');

    expect(result.complete).toBe(false);
    expect(result.items).toEqual([]);
  });

  it('缺少分页信息标记为不完整', async () => {
    installFetch([{ data: [{ content: { type: 'answer', id: 1 } }] }]);

    const result = await fetchCollectionContentsDetailed('c1', '收藏夹');

    expect(result.complete).toBe(false);
    expect(result.items).toHaveLength(1);
  });

  it('备用接口也失败时抛出错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, false)));

    await expect(fetchCollectionContentsDetailed('c1', '收藏夹')).rejects.toThrow('获取收藏夹内容失败');
  });
});

describe('fetchCollectionContents 兼容封装', () => {
  it('仍返回纯数组，供不关心完整性的调用点使用', async () => {
    installFetch([{ data: [{ content: { type: 'answer', id: 1 } }], paging: { is_end: true } }]);

    const items = await fetchCollectionContents('c1', '收藏夹');

    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(1);
  });
});
