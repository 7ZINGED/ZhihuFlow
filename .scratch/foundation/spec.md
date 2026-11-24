# Foundation spec — 工程基线重建

Status: active
Created: 2026-11-24

## Problem

ZhihuFlow 能在浏览器里完成完整的三阶段 AI 分拣，但仓库本身缺少让 agent 安全改动的工程基线：

- 没有测试、CI、领域词汇表与 ADR；
- `Dashboard.tsx` 同时承担 UI、队列编排、DB 写入与 AI 调用，没有可测试的缝；
- 最近多次提交都是 sync / queue 的数据一致性修复，却没有回归保护；
- `npm run compile` 在 Phase 0 之前实际是红的（48 个类型错误），说明“唯一的守卫”也没有真正生效。

## Solution

分三步建立基线，每一步都以 `npm run check` 绿为门槛：

1. **Phase 0 地基**：本地 markdown tracker、`AGENTS.md`、Vitest、CI、修复类型检查基线。
2. **Phase 1 语言与缝**：`GLOSSARY.md`、ADR 0001–0003、`mergeArticle` 与 AI 纯边界的特征测试。
3. **Phase 2 首个迭代**：把 `runQueueLoop` 抽成 `queueEngine` 深模块，Dashboard 只做接线。

## Scope

In scope:

- 测试基础设施与 CI
- 仓库级 Agent 文档与本地 issue tracker
- 领域词汇表与架构决策记录
- `mergeArticle` 纯函数化
- AI 客户端的解析 / 提示词 / 错误映射纯边界
- `queueEngine` 抽取与 Dashboard 接线

Out of scope:

- 新功能、UI 改版、AI 提示词调优
- 迁移到 GitHub Issues / Linear
- 权限系统或同步模型重写
- pre-commit 钩子（等格式化策略确定后再加）

## Acceptance

- [ ] `npm run check` 在本地与 CI 均为绿
- [x] `AGENTS.md`、`docs/agents/*` 与 `.scratch/` tracker 可用
- [ ] `GLOSSARY.md` 收录核心术语，ADR 0001–0003 落盘
- [ ] `mergeArticle` 与 AI 纯边界有特征测试，且不改变现有行为
- [ ] `queueEngine` 在 fake ports 下覆盖分片、暂停 / 恢复、熔断、跳过
- [ ] `Dashboard.tsx` 降到 800 行以内，UI 行为不变

## Ticket map

| # | Ticket | Blocked by | Status |
| :--- | :--- | :--- | :--- |
| 01 | 提交待提交的 `wxt.config.ts` 变更 | — | done |
| 02 | 接入 Vitest 与 CI 守卫 | — | done |
| 03 | 建立仓库级 Agent 配置与本地 tracker | — | done |
| 04 | 建立领域词汇表与前三条 ADR | — | ready-for-agent |
| 05 | 抽出 `mergeArticle` 并写特征测试 | 04 | ready-for-agent |
| 06 | 抽出 AI 客户端纯边界并写特征测试 | 04 | ready-for-agent |
| 07 | 抽出 `queueEngine` 深模块 | 04, 06, 09 | ready-for-agent |
| 08 | Dashboard 接入 `queueEngine` | 07 | ready-for-agent |
| 09 | 决定队列状态的唯一真相源 | — | ready-for-human |
| 10 | 恢复 `noUncheckedIndexedAccess` | 08 | ready-for-agent |
