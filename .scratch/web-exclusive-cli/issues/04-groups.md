# 04: Groups CRUD

**What to build:** groups 的创建、列表、更新、删除（含 bulk delete），以及查看/设置 group 成员。

**Blocked by:** 02 Orgs & members 只读

**Status:** done

- [x] create/list/edit/delete group 可用，含 bulk delete
- [x] 可查看与设置 group 的成员列表
- [x] `--orgid` 显式传参
- [x] command 层测试覆盖 CRUD 的 API 调用

## Comments

### Review remediation

本次修复补齐 Commander 参数绑定、group API envelope、成员设置输出、`--json` alias、2FA structured output、PolicyType 校验及 i18n，并改用 typed Jest mocks。关联实现位于 `apps/bwadmin/src/`，英文 locale 复用 `apps/cli/src/locales/en/messages.json`，未修改原有 CLI 命令实现或需求契约。

验证使用 Node 24，限定 `apps/bwadmin` 的 Jest 共 95 tests 通过，应用 TypeScript 检查通过。尚未连接真实 Vaultwarden 实例，不能据此声称完成服务端端到端验证。
