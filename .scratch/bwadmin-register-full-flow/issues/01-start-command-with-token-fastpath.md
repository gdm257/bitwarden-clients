Status: resolved

# 01 Registration Start 命令与 token 直返快速路径

## What to build

`bwadmin register <email>` 识别 email 参数，向目标实例（self-hosted environment）发起 send-verification-email；对无需邮件验证的实例（响应直接携带 token）跳过交互、一步完成 Registration Finish 建号。含 email 参数校验与 `--name` 透传、单测。

## Acceptance criteria

- [x] email 参数触发 send-verification-email，携带 email 与可选 name
- [x] 200 响应携带 token 时无交互完成注册，成功输出账号邮箱
- [x] URL 参数走既有收尾行为，回归不变
- [x] 服务端错误原样呈现并以非零码退出

## Blocked by

None (can start immediately)

## Answer

已实现于 commit 50378d6602，并合入集成分支（merge 3c48702e9a）。

- `RegisterCommand.run` 按参数形态分流；email 形态校验 self-hosted 环境（`isCloud() || !hasBaseUrl()` 即报错）后调用 send-verification-email，body 携带 email 与可选 `--name`。
- 200 直返 token 时直接复用既有 finish 管线，无交互建号。
- URL 形态行为不变；含未编码 `@` 的 finish-signup 链接由 7a08a631f1 保证仍走收尾（原 `includes("@")` 判定会误分流）。
- 服务端错误经 `Response.error` 原样呈现并以非零码退出。
- `--name` 只作用于发起请求（账号名随 token claims 进入 finish），未扩展 finish 请求模型。
- `npx nx test bwadmin` 全绿（新增 4 个用例）。

E2E：对 vault.vaultwarden.com（开启邮件验证）实测 `register <email>` 收到 204 并进入粘贴提示，说明 start 请求与响应分流正确。
