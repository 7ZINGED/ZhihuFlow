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
- 2026-11-24: ticket 11 完成后实测 `tsc --noEmit --noUncheckedIndexedAccess`，错误不降反升到 **37 处**：`queueEngine.ts` 14、`ai.ts` 8、`queueEngine.test.ts` 5、`zhihuApi.ts` 3、`Dashboard.tsx` 2、`queueReconcile.test.ts` 2、`entrypoints/background.ts` 2、`AutoOrganizeModal.tsx` 1。新增模块也带入了数组访问。
- 2026-11-24: 本票标注 `Blocked by: 08`（Dashboard 拆分），但 08 仍是 `ready-for-human`，当前状态与阻塞关系不一致。建议维持暂缓：现在修 37 处，等 Dashboard 后续按块拆分时大概率还要重改一遍。
