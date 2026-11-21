Status: resolved

# 03 bwadmin locales 构建副本修复

## What to build

让 bwadmin 构建产物中的 locales messages.json 随源码刷新（纳入 build 依赖或复制步骤），使 i18n placeholders 插值在运行时生效；为新增文案补充 messages.json 条目与 placeholders 声明。

## Acceptance criteria

- [x] 修改 apps/cli locales 后 nx build，dist 副本内容同步
- [x] 运行 bwadmin 成功输出显示插值后的邮箱/密码而非 $1$
- [x] messages.spec.ts 保持通过

## Blocked by

None (can start immediately)

## Answer

已实现于 commit e479f297b1，并合入集成分支（merge 50a0c41223）。

- 根因：bwadmin build target 继承 `targetDefaults.build.inputs`，只覆盖 `{projectRoot}/**/*`；locales 源在 apps/cli/src/locales，改动不使缓存失效。
- 修复：apps/bwadmin/project.json 的 build target 增加 `inputs: ["production", "^production", "{workspaceRoot}/apps/cli/src/locales/**/*"]`（1 行）。
- 验证：临时改动 locale 后 `nx build` 缓存 miss 且 dist 副本同步，还原后缓存命中且副本与源文件哈希一致；`npx nx test cli --testPathPattern messages`（实际跑 CLI 全量）通过。
- 新增文案的 messages.json 条目由 01/02 各自添加，未在本 ticket 重复。

E2E：`register --generate` 成功输出 "Initial password: <生成密码>" 而非 `$1$`。
