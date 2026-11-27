import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve(process.cwd(), 'scripts/check-no-secrets.mjs');

function runCheck(text: string): { status: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [script, '--check-text', text], {
      encoding: 'utf8',
    });
    return { status: 0, output };
  } catch (error: any) {
    return { status: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

describe('check-no-secrets', () => {
  it('放行显式假 Key', () => {
    const result = runCheck(`apiKey: 'sk-test-${'a'.repeat(32)}'`);
    expect(result.status).toBe(0);
    expect(result.output).toContain('Key 扫描通过');
  });

  it('阻断疑似真实 Key，且不会把真实 Key 写进测试源码', () => {
    const suspected = `apiKey: 'sk-${'a'.repeat(32)}'`;
    const result = runCheck(suspected);
    expect(result.status).toBe(1);
    expect(result.output).toContain('疑似真实 API Key');
  });

  it('放行普通的 API Key 字段名与空值', () => {
    const result = runCheck("apiKey: '', token: 'placeholder'");
    expect(result.status).toBe(0);
  });
});
