import { describe, expect, it } from 'vitest';
import { mapHttpError, normalizeTags, parseAiJson, stripCodeFence } from './aiParse';

describe('stripCodeFence', () => {
  it('去掉 json 围栏', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('围栏无语言标记、大小写混用也能去掉', () => {
    expect(stripCodeFence('```JSON\n[1,2]\n```')).toBe('[1,2]');
  });

  it('没有围栏时只做 trim', () => {
    expect(stripCodeFence('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe('parseAiJson', () => {
  it('解析纯 JSON 对象', () => {
    expect(parseAiJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('解析带围栏的 JSON', () => {
    expect(parseAiJson('```json\n{"summary":"x"}\n```')).toEqual({ summary: 'x' });
  });

  it('忽略 JSON 前后的解释性文字', () => {
    expect(parseAiJson('好的，结果如下：\n{"a":1}\n以上。')).toEqual({ a: 1 });
  });

  it('解析对象数组', () => {
    expect(parseAiJson('[{"id":"1"},{"id":"2"}]')).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('数组前后有文字时仍能取出数组', () => {
    expect(parseAiJson('分类结果：\n[{"id":"1"}]\n希望有帮助')).toEqual([{ id: '1' }]);
  });

  it('空响应返回 null', () => {
    expect(parseAiJson('')).toBeNull();
    expect(parseAiJson('   ')).toBeNull();
  });

  it('非法 JSON 返回 null 而不抛异常', () => {
    expect(parseAiJson('这不是 JSON')).toBeNull();
    expect(parseAiJson('{"a":}')).toBeNull();
  });
});

describe('normalizeTags', () => {
  it('去空白与前导井号', () => {
    expect(normalizeTags([' #前端架构 ', '##量化金融'], 5)).toEqual(['前端架构', '量化金融']);
  });

  it('丢弃空值与超过 15 字的标签', () => {
    expect(normalizeTags(['', '   ', '这是一个非常非常长的标签名称超过十五个字', '有效'], 5)).toEqual(['有效']);
  });

  it('按上限截断', () => {
    expect(normalizeTags(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });

  it('非数组返回空数组', () => {
    expect(normalizeTags('前端', 3)).toEqual([]);
    expect(normalizeTags(undefined, 3)).toEqual([]);
  });
});

describe('mapHttpError', () => {
  it('优先取 JSON 里的 error.message', () => {
    expect(mapHttpError(400, '{"error":{"message":"model not found"}}')).toBe('model not found');
  });

  it('HTML 错误页给出端点提示', () => {
    expect(mapHttpError(404, '<!DOCTYPE html><html>Not Found</html>')).toContain('HTML 错误页');
  });

  it('网络类关键词归一为超时提示', () => {
    expect(mapHttpError(500, 'dial tcp 1.2.3.4:443: connectex: connection refused')).toContain('网络连接超时');
  });

  it('auth_unavailable 归一为凭据失效', () => {
    expect(mapHttpError(502, 'auth_unavailable: no auth available')).toContain('凭据失效');
  });

  it('空响应体按状态码给提示', () => {
    expect(mapHttpError(401, '')).toContain('API Key');
    expect(mapHttpError(429, '  ')).toContain('限流');
  });

  it('超长消息被截断且保留状态码提示', () => {
    const long = 'x'.repeat(200);
    const result = mapHttpError(500, long);

    expect(result.startsWith('上游服务内部错误：')).toBe(true);
    expect(result.endsWith('...')).toBe(true);
    expect(result.length).toBeLessThan(100);
  });
});
