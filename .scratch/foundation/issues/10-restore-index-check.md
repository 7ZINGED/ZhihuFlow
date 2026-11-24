# 10: 恢复 noUncheckedIndexedAccess

**What to build:** Phase 0 为了让 CI 变绿，在 `tsconfig.json` 暂时关闭了 `noUncheckedIndexedAccess`。等 `Dashboard` 拆分完成后，恢复该检查，并逐处用真实守卫（而不是非空断言）修复数组越界访问。

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] 删除 `tsconfig.json` 中的 `"noUncheckedIndexedAccess": false`
- [ ] 逐个修复报错点，优先使用提前返回或 `continue`，避免 `!` 断言
- [ ] `npm run check` 在恢复严格检查后仍为绿
- [ ] 在 `AGENTS.md` 中删掉关于临时放宽的说明

## Comments

- 2026-11-24: 关闭前共有 23 处相关错误，主要集中在 Dashboard 的队列循环与 AI 批量解析；拆分后应大幅减少。
