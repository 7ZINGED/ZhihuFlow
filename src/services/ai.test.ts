import { describe, expect, it } from 'vitest';
import { normalizeEndpoint } from './ai';

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
