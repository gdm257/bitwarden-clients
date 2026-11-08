# 05: Collections 权限

**What to build:** collections 的 CRUD、查看 details、为 group/user 分配访问权限、bulk access 更新、bulk delete。

**Blocked by:** 02 Orgs & members 只读

**Status:** done

- [x] collection create/list/edit/delete 可用
- [x] 可分配/回收 group 与 user 的 collection 访问权限
- [x] bulk access 更新与 bulk delete 可用
- [x] command 层测试覆盖权限分配的 API 调用

## Comments

### Review remediation

本次修复补齐 Commander 参数绑定、group API envelope、成员设置输出、`--json` alias、2FA structured output、PolicyType 校验及 i18n，并改用 typed Jest mocks。关联实现位于 `apps/bwadmin/src/`，英文 locale 复用 `apps/cli/src/locales/en/messages.json`，未修改原有 CLI 命令实现或需求契约。

验证使用 Node 24，限定 `apps/bwadmin` 的 Jest 共 95 tests 通过，应用 TypeScript 检查通过。尚未连接真实 Vaultwarden 实例，不能据此声称完成服务端端到端验证。
