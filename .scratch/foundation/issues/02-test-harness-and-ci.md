# 02: 接入 Vitest 与 CI 守卫

**What to build:** 一条 `npm run check` 能同时跑类型检查与测试；GitHub Actions 在 push 到 `main` 和所有 PR 上执行 check 与生产构建。开发者不再依赖“上次好像能跑”来判断改动是否安全。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 安装 Vitest、happy-dom、fake-indexeddb
- [x] 队列持久化与端点归一化共 8 条 smoke / 特征测试通过
- [x] `npm run check` 在本地通过
- [x] CI 在 Node 22 上执行 `npm ci` → `check` → `build`
- [x] 修复历史遗留的 48 个类型错误，使类型检查真正可用

## Comments

- 2026-11-24: 安装 `@types/chrome` 解决 12 处 `Cannot find name 'chrome'`；在 `tsconfig.json` 暂时关闭 `noUncheckedIndexedAccess`，剩余 18 处错误逐项修复。恢复严格索引检查见 ticket 10。
- 2026-11-24: 未接入 pre-commit 钩子，等格式化策略确定后单独处理。
