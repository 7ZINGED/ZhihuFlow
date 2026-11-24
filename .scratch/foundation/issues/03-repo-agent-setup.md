# 03: 建立仓库级 Agent 配置与本地 tracker

**What to build:** 新会话进入仓库时，能在一屏内知道命令、目录、硬规则、测试缝和工单在哪里；工程技能能按本地 markdown 约定创建、阻塞和关闭 ticket。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `AGENTS.md` 包含命令、布局、架构规则、完成定义与 Agent skills 块
- [x] `docs/agents/issue-tracker.md` 定义 `.scratch/` 的 spec、ticket、阻塞边与 wayfinding 约定
- [x] `docs/agents/domain.md` 声明 single-context，并规定 glossary / ADR 的读取方式
- [x] `docs/agents/triage-labels.md` 五个角色与默认字符串一一对应
- [x] `.scratch/foundation/` 下建立 spec 与首批 tickets

## Comments

- 2026-11-24: 选择 local markdown 而不是 GitHub Issues：本机没有 `gh` CLI，当前是单人维护；升级路径写在 issue-tracker 文档末尾。
