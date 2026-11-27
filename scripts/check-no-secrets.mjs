#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

/**
 * ADR-0007 / ticket 15：提交前扫描新增行，阻断疑似真实 API Key。
 * 显式假 Key（sk-test- 前缀）豁免，方便测试与文档 sample 入仓。
 */

const HIGH_ENTROPY_PATTERNS = [
  { name: 'OpenAI/兼容服务 Key', re: /\bsk-[A-Za-z0-9_-]{24,}\b/g },
  { name: 'Anthropic Key', re: /\bsk-ant-[A-Za-z0-9_-]{24,}\b/g },
  { name: 'AWS Access Key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'GitHub Token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: 'Google API Key', re: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
];

const ASSIGNMENT_PATTERN = /\b(?:api[_-]?key|apiKey|token|secret)\b\s*[:=]\s*['"`]([A-Za-z0-9_-]{24,})['"`]/gi;
const FAKE_KEY_PATTERN = /sk-test-[A-Za-z0-9_-]*/gi;

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

export function findSuspectedSecrets(text) {
  if (!text) return [];
  const cleaned = text.replace(FAKE_KEY_PATTERN, '');
  const hits = [];

  for (const { name, re } of HIGH_ENTROPY_PATTERNS) {
    re.lastIndex = 0;
    for (const match of cleaned.matchAll(re)) {
      hits.push({
        name,
        value: match[0],
        line: lineNumberAt(cleaned, match.index ?? 0),
      });
    }
  }

  ASSIGNMENT_PATTERN.lastIndex = 0;
  for (const match of cleaned.matchAll(ASSIGNMENT_PATTERN)) {
    hits.push({
      name: '疑似硬编码凭据',
      value: match[1] ?? match[0],
      line: lineNumberAt(cleaned, match.index ?? 0),
    });
  }

  const seen = new Set();
  return hits.filter((hit) => {
    const key = `${hit.line}:${hit.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function addedLinesFromDiff(diff) {
  return diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .join('\n');
}

function readStagedDiff() {
  try {
    return execFileSync('git', ['diff', '--cached', '--unified=0', '--diff-filter=ACMRT'], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    console.error(`❌ 无法读取 staged diff：${error.message}`);
    process.exit(2);
  }
}

function readTrackedText() {
  try {
    const files = execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    }).split('\0').filter(Boolean);
    const binary = /\.(png|jpe?g|gif|webp|ico|pdf|zip|mp4|woff2?|ttf)$/i;

    return files
      .filter((file) => !binary.test(file))
      .map((file) => {
        try {
          if (statSync(file).size > 1024 * 1024) return '';
          return readFileSync(file, 'utf8');
        } catch {
          return '';
        }
      })
      .join('\n');
  } catch (error) {
    console.error(`❌ 无法读取工作区文件：${error.message}`);
    process.exit(2);
  }
}

function selfTest() {
  const fake = `apiKey: 'sk-test-${'a'.repeat(32)}'`;
  const real = `apiKey: 'sk-${'a'.repeat(32)}'`;

  if (findSuspectedSecrets(fake).length > 0) {
    console.error('❌ 假 Key 被误判为真实 Key');
    process.exit(1);
  }
  if (findSuspectedSecrets(real).length === 0) {
    console.error('❌ 疑似真实 Key 未被阻断');
    process.exit(1);
  }
  console.log('✅ Key 扫描自检通过：假 Key 放行，疑似真实 Key 阻断');
}

function main(argv) {
  if (argv.includes('--self-test')) {
    selfTest();
    return;
  }

  const textIndex = argv.indexOf('--check-text');
  let text;
  if (textIndex >= 0) {
    text = argv[textIndex + 1] ?? '';
  } else if (argv.includes('--check-worktree')) {
    text = readTrackedText();
  } else {
    text = addedLinesFromDiff(readStagedDiff());
  }
  const hits = findSuspectedSecrets(text);

  if (hits.length > 0) {
    console.error('❌ 检测到疑似真实 API Key，已阻断提交：');
    for (const hit of hits) {
      console.error(`   - 第 ${hit.line} 行 [${hit.name}] ${hit.value}`);
    }
    console.error('   测试请用 sk-test- 前缀；真实 Key 只放在 chrome.storage.local。');
    process.exitCode = 1;
    return;
  }

  console.log('✅ Key 扫描通过，未发现疑似真实凭据');
}

main(process.argv.slice(2));
