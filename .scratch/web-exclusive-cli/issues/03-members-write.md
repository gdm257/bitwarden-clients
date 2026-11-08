# 03: Members 写操作

**What to build:** 成员全生命周期管理：invite、reinvite、remove、revoke、restore（单个与 bulk）、confirm（单个与 bulk）。confirm 复用现有 member-confirm crypto 路径，不新增加密逻辑——这是本 change 最安全敏感的命令。

**Blocked by:** 02 Orgs & members 只读

**Status:** done

- [x] invite/reinvite/remove/revoke/restore 单个与 bulk 均可用
- [x] confirm 单个与 bulk 走现有 crypto 服务；测试只断言委托，不断言加密细节
- [x] bulk 操作输出每项成功/失败结果
- [x] command 层测试覆盖每类操作的 API 调用

## Comments

### Review remediation

本次修复补齐 Commander 参数绑定、group API envelope、成员设置输出、`--json` alias、2FA structured output、PolicyType 校验及 i18n，并改用 typed Jest mocks。关联实现位于 `apps/bwadmin/src/`，英文 locale 复用 `apps/cli/src/locales/en/messages.json`，未修改原有 CLI 命令实现或需求契约。

验证使用 Node 24，限定 `apps/bwadmin` 的 Jest 共 95 tests 通过，应用 TypeScript 检查通过。尚未连接真实 Vaultwarden 实例，不能据此声称完成服务端端到端验证。
