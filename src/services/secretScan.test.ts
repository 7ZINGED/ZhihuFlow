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
  it('allows explicit fake keys', () => {
    const result = runCheck(`apiKey: 'sk-test-${'a'.repeat(32)}'`);
    expect(result.status).toBe(0);
    expect(result.output).toContain('Key 扫描通过');
  });

  it('blocks suspected real keys without hardcoding one in the test source', () => {
    const suspected = `apiKey: 'sk-${'a'.repeat(32)}'`;
    const result = runCheck(suspected);
    expect(result.status).toBe(1);
    expect(result.output).toContain('疑似真实 API Key');
  });

  it('allows ordinary api key fields with empty values', () => {
    const result = runCheck("apiKey: '', token: 'placeholder'");
    expect(result.status).toBe(0);
  });
});
