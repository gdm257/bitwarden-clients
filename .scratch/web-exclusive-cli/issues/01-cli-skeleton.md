# 01: CLI app skeleton

**What to build:** 新 CLI 应用可执行 `config`（server URL）、`login`（master password + 2FA challenge）、`unlock`、`lock`、`sync`、`logout`，行为与 `bw` 对应命令一致。完成后其余所有命令都有了运行基础。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 新 app 出现在 nx workspace 中，`nx build` 产出可运行 CLI
- [x] `login` 走 password grant，支持 2FA challenge 输入
- [x] `unlock`/`lock`/`sync`/`logout`/`config` 行为与 `apps/cli` 一致
- [x] 服务端拒绝（如 SIGNUPS_VERIFY 未验证邮箱）时错误信息如实透出
- [x] command 层测试覆盖 login/unlock 主路径

## Comments

### Review remediation

本次修复补齐 Commander 参数绑定、group API envelope、成员设置输出、`--json` alias、2FA structured output、PolicyType 校验及 i18n，并改用 typed Jest mocks。关联实现位于 `apps/bwadmin/src/`，英文 locale 复用 `apps/cli/src/locales/en/messages.json`，未修改原有 CLI 命令实现或需求契约。

验证使用 Node 24，限定 `apps/bwadmin` 的 Jest 共 95 tests 通过，应用 TypeScript 检查通过。尚未连接真实 Vaultwarden 实例，不能据此声称完成服务端端到端验证。
