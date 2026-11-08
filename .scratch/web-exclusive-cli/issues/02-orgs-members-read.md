# 02: Orgs & members 只读

**What to build:** `list orgs` 与 `list members --orgid`：表格默认、`--raw`/`--json` 输出机器可读格式，展示成员 status、role、email。这是所有 org 管理命令的入口体验样板。

**Blocked by:** 01 CLI app skeleton

**Status:** done

- [x] `list orgs` 输出用户所属组织（id 用于后续 `--orgid`）
- [x] `list members` 输出成员 email/status/role/id
- [x] `--raw` 输出 JSON，默认输出表格
- [x] command 层测试断言 ApiService 调用与两种输出格式

## Comments

### Review remediation

本次修复补齐 Commander 参数绑定、group API envelope、成员设置输出、`--json` alias、2FA structured output、PolicyType 校验及 i18n，并改用 typed Jest mocks。关联实现位于 `apps/bwadmin/src/`，英文 locale 复用 `apps/cli/src/locales/en/messages.json`，未修改原有 CLI 命令实现或需求契约。

验证使用 Node 24，限定 `apps/bwadmin` 的 Jest 共 95 tests 通过，应用 TypeScript 检查通过。尚未连接真实 Vaultwarden 实例，不能据此声称完成服务端端到端验证。
