# 01: 提交待提交的 wxt.config.ts 变更

**What to build:** 把工作区里已有的 `host_permissions` 变更独立提交，让后续所有改动都从干净基线开始。该变更只是为新接入的模型服务补充域名白名单，不涉及运行时逻辑。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 变更单独成一个 `chore(config)` 提交
- [x] 提交后 `git status` 干净
- [x] 构建仍然通过

## Comments

- 2026-11-24: Phase 0 执行时完成，提交信息 `chore(config): allow additional AI provider hosts`。
