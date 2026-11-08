# 06: Policies 查看与更新

**What to build:** 列出组织的所有 policies 及启用状态，启用/禁用/更新单个 policy 配置。

**Blocked by:** 02 Orgs & members 只读

**Status:** done

- [x] `list policies --orgid` 展示各 policy 类型与启用状态
- [x] 可更新单个 policy 的启用与配置
- [x] command 层测试覆盖 GET/PUT 调用

## Comments

### Review remediation

本次修复补齐 Commander 参数绑定、group API envelope、成员设置输出、`--json` alias、2FA structured output、PolicyType 校验及 i18n，并改用 typed Jest mocks。关联实现位于 `apps/bwadmin/src/`，英文 locale 复用 `apps/cli/src/locales/en/messages.json`，未修改原有 CLI 命令实现或需求契约。

验证使用 Node 24，限定 `apps/bwadmin` 的 Jest 共 95 tests 通过，应用 TypeScript 检查通过。尚未连接真实 Vaultwarden 实例，不能据此声称完成服务端端到端验证。
