# 10: 恢复 noUncheckedIndexedAccess

**What to build:** Phase 0 为了让 CI 变绿，在 `tsconfig.json` 暂时关闭了 `noUncheckedIndexedAccess`。等 `Dashboard` 拆分完成后，恢复该检查，并逐处用真实守卫（而不是非空断言）修复数组越界访问。

**Blocked by:** 08（Dashboard 拆分，本轮已完成）

**Status:** done

- [x] 删除 `tsconfig.json` 中的 `"noUncheckedIndexedAccess": false`
- [x] 逐个修复报错点，优先使用提前返回或 `continue`，避免 `!` 断言
- [x] `npm run check` 在恢复严格检查后仍为绿（142 条测试全绿）
- [x] 在 `AGENTS.md` 中删掉关于临时放宽的说明，改为「必须用真实守卫，禁止 `!` 断言」

## 修复清单（37 处 → 0）

| 文件 | 原错误数 | 修法 |
| :--- | :--- | :--- |
| `src/services/queueEngine.ts` | 14 | 单篇循环 `const task = tasks[i]` 后加 `if (!task) continue;` |
| `src/services/ai.ts` | 8 | 单篇分支 `if (!single) return resultMap;`；批量循环 `if (!art) continue;`；`batchTaxonomy[0] ?? '未归类'` |
| `src/services/queueEngine.test.ts` | 5 | 断言改用可选链 `final.tasks[0]?.status`、`updates[0]?.patch.x` |
| `src/services/zhihuApi.ts` | 3 | `tabs[0]` 提局部变量 `activeTab` 并守卫；`match[1]` 加 `if (!id) return;`；`countMatch?.[1]` |
| `src/views/Dashboard.tsx` | 2 | 标签热度排序 `tagFrequency[b] ?? 0` |
| `src/services/queueReconcile.test.ts` | 2 | 断言改用可选链 |
| `entrypoints/background.ts` | 2 | `tabs[0]` 提局部变量 `dashboardTab` 并守卫 |
| `src/components/AutoOrganizeModal.tsx` | 1 | `colArticleCounts[c.id] ?? 0` |

原则：全部用真实守卫（提前返回 / `continue` / `??` / 可选链），**没有使用任何 `!` 非空断言**。

## Comments

- 2026-11-24: 关闭前共有 23 处相关错误，主要集中在 Dashboard 的队列循环与 AI 批量解析；拆分后应大幅减少。
- 2026-11-24: ticket 11 完成后实测 `tsc --noEmit --noUncheckedIndexedAccess`，错误不降反升到 **37 处**：`queueEngine.ts` 14、`ai.ts` 8、`queueEngine.test.ts` 5、`zhihuApi.ts` 3、`Dashboard.tsx` 2、`queueReconcile.test.ts` 2、`entrypoints/background.ts` 2、`AutoOrganizeModal.tsx` 1。新增模块也带入了数组访问。
- 2026-11-24: 原标注 `Blocked by: 08`；08 的 Dashboard 拆分在本轮完成（1739→772 行）后解除阻塞并立即修复。
- 2026-11-24: 验证：`npm run check`（0 类型错误、142 测试）与 `npm run build`（598.88 kB）均通过。
