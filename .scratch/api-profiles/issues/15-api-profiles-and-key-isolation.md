# 15: API 配置档案与 Key 隔离

**What to build:** 用户能保存多份命名的 API 配置档案并在它们之间切换；旧的单份设置自动迁移为默认档案；队列任务在入队时快照配置，运行中切换不影响在途任务；导出备份不再包含 Key；提交前能自动阻断疑似真实 Key 进入 git。

**Blocked by:** None (can start immediately)

**Status:** done

**Parent spec:** `.scratch/api-profiles/spec.md`

- [x] 用户在设置面板能新增、重命名、删除 API 配置档案，并看到哪份正在生效
- [x] 切换激活档案后，新入队的 AI 任务使用新档案；在途任务仍用入队时快照的档案
- [x] 首次启动时旧扁平 `ai_settings` 迁移为一份默认档案，已有接口、模型、Key、提示词与上限不丢
- [x] 至少保留一份档案；删除操作不会让系统进入无配置状态
- [x] 接口预设按钮只改正在编辑档案的接口地址与模型名，不覆盖 Key、提示词与批次上限
- [x] 导出备份中的档案 Key 为空；导入后提示用户重新填写 Key
- [x] 导入旧版本扁平 settings 备份时仍能迁移成档案，且导入的 Key 置空
- [x] 配置档案模块有公共缝测试：CRUD、激活切换、迁移、导出脱敏、导入置空、入队快照不随切换变化
- [x] 提交前 Key 扫描脚本存在且接入检查：假 Key 通过，疑似真实 Key 阻断
- [x] `npm run check` 通过

## Comments

- 已在临时 git 仓库用真实 staged diff 验证 Key 扫描：`sk-test-` 假 Key 放行，构造的疑似真实 Key 触发非零退出并阻断提交；验证字符串未写入仓库。
- pre-commit hook 由 `scripts/install-git-hooks.mjs` 安装，`npm run check` 同时执行自检、staged diff 扫描与工作区全量扫描；CI 显式执行 `npm run check:secrets:all`。
