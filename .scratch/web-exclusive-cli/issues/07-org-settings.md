# 07: Org settings 查看与更新

**What to build:** 查看与更新组织设置（名称等），查看 org 公钥与 org api-key 信息。

**Blocked by:** 02 Orgs & members 只读

**Status:** done

- [x] 查看 org 设置可用
- [x] 更新 org 设置可用
- [x] command 层测试覆盖 GET/PUT 调用

## Comments

### Review remediation

本次修复补齐 Commander 参数绑定、group API envelope、成员设置输出、`--json` alias、2FA structured output、PolicyType 校验及 i18n，并改用 typed Jest mocks。关联实现位于 `apps/bwadmin/src/`，英文 locale 复用 `apps/cli/src/locales/en/messages.json`，未修改原有 CLI 命令实现或需求契约。

验证使用 Node 24，限定 `apps/bwadmin` 的 Jest 共 95 tests 通过，应用 TypeScript 检查通过。尚未连接真实 Vaultwarden 实例，不能据此声称完成服务端端到端验证。
