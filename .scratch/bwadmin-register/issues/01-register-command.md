# 01: register 命令最小闭环（链接 → 注册完成）

**What to build:** 用户把注册邮件里的 finish-signup 链接粘贴给 `bwadmin register <url>`，CLI 解析出 email 与 token，交互式输入并二次确认 master password，复用 libs 既有注册管线（prelogin KDF 参数、master key 派生、register finish 请求）完成建号，成功后输出账号 email 与下一步提示。链接缺 token/email 或不是 finish-signup URL 时报清晰错误。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 合法链接（含 email/token query 参数）解析成功
- [x] 缺 token、缺 email、非 finish-signup URL 三种输入各有明确错误输出
- [x] 交互式输入 master password，两次不一致时重新输入
- [x] 注册请求体（KDF 参数、email、token、密码派生字段）有测试覆盖（mock API）
- [x] 成功后输出账号 email 与"下一步 confirm"提示

## Answer

实现于分支 `register-01`，commit `ead3a615`（`feat(cli-admin): add register command`）。新增 `apps/bwadmin/src/register.command.ts`（RegisterCommand：hash-fragment 链接解析、inquirer 两次密码确认、prelogin KDF + `LegacyCompatKeyService`/`MasterPasswordService` 派生 + `AccountApiService.registerFinish`），wired in `admin.program.ts`（register 不要求已登录），i18n 键在 `apps/cli/src/locales/en/messages.json`。测试 `register.command.spec.ts` 5 例 + `admin.program.spec.ts` wiring 1 例；bwadmin 全套 101 passed。
