#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** 安装 pre-commit hook：每次提交前扫描 staged diff 中的疑似真实 Key。 */
function resolveGitDir(start) {
  const gitPath = resolve(start, '.git');
  if (!existsSync(gitPath)) return null;
  if (statSync(gitPath).isDirectory()) return gitPath;

  const content = readFileSync(gitPath, 'utf8');
  const match = content.match(/^gitdir:\s*(.+)$/m);
  return match ? resolve(start, match[1].trim()) : null;
}

const gitDir = resolveGitDir(process.cwd());
if (!gitDir) {
  console.log('ℹ️ 当前目录不是 git 仓库，跳过 hook 安装');
  process.exit(0);
}

const hooksDir = resolve(gitDir, 'hooks');
mkdirSync(hooksDir, { recursive: true });
const hookPath = resolve(hooksDir, 'pre-commit');
const content = '#!/bin/sh\nnode scripts/check-no-secrets.mjs\n';
writeFileSync(hookPath, content, { mode: 0o755 });
chmodSync(hookPath, 0o755);
console.log('✅ 已安装 pre-commit Key 扫描 hook');
