import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAISettings, normalizeEndpoint, testApiConnection } from './ai';
import { DEFAULT_AI_SETTINGS, pinSettings } from './apiProfiles';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeEndpoint', () => {
  it('为 base URL 补全 chat/completions 路径', () => {
    expect(normalizeEndpoint('https://api.deepseek.com/v1')).toBe(
      'https://api.deepseek.com/v1/chat/completions'
    );
  });

  it('已经是完整端点时保持不变', () => {
    expect(normalizeEndpoint('https://api.openai.com/v1/chat/completions')).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
  });

  it('去掉首尾空白与多余斜杠', () => {
    expect(normalizeEndpoint('  http://127.0.0.1:11434/v1///  ')).toBe(
      'http://127.0.0.1:11434/v1/chat/completions'
    );
  });
});

describe('getAISettings', () => {
  it('队列运行期间优先返回钉住的入队快照', async () => {
    const pinned = { ...DEFAULT_AI_SETTINGS, model: 'pinned-model' };
    const release = pinSettings(pinned);
    try {
      expect((await getAISettings()).model).toBe('pinned-model');
    } finally {
      release();
    }
  });
});

describe('testApiConnection', () => {
  const settings = {
    ...DEFAULT_AI_SETTINGS,
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: 'sk-test-connectivity',
  };

  it('发送 max_tokens=1 的极小请求并返回模型与耗时', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ model: 'deepseek-chat', choices: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testApiConnection(settings);

    expect(result.ok).toBe(true);
    expect(result.model).toBe('deepseek-chat');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(init?.headers?.Authorization).toBe('Bearer sk-test-connectivity');
    const body = JSON.parse(init?.body);
    expect(body.max_tokens).toBe(1);
    expect(body.model).toBe('deepseek-chat');
  });

  it('配置缺失时不发请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await testApiConnection({ ...settings, apiKey: '' });

    expect(result.ok).toBe(false);
    expect(result.category).toBe('config');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('鉴权失败归类为 auth', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key',
    }));

    const result = await testApiConnection(settings);

    expect(result.ok).toBe(false);
    expect(result.category).toBe('auth');
    expect(result.message).toContain('401');
  });

  it('网络异常归类为 network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await testApiConnection(settings);

    expect(result.ok).toBe(false);
    expect(result.category).toBe('network');
    expect(result.message).toContain('offline');
  });

  it('非 JSON 响应归类为 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('bad json'); },
    }));

    const result = await testApiConnection(settings);

    expect(result.ok).toBe(false);
    expect(result.category).toBe('response');
  });
});
