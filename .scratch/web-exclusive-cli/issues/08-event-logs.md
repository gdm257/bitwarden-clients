# 08: Event logs 查询

**What to build:** 查询组织事件、单成员事件、单 cipher 事件，支持 start/end 时间过滤与 continuation 分页。不做 "My events"（Vaultwarden 无此路由）。

**Blocked by:** 02 Orgs & members 只读

**Status:** done

- [x] org 级事件查询可用，支持 start/end 过滤
- [x] 指定 member / cipher 的事件查询可用
- [x] continuation 分页可用
- [x] command 层测试覆盖 getEvents* 调用与参数

## Comments

### Review remediation

本次修复补齐 Commander 参数绑定、group API envelope、成员设置输出、`--json` alias、2FA structured output、PolicyType 校验及 i18n，并改用 typed Jest mocks。关联实现位于 `apps/bwadmin/src/`，英文 locale 复用 `apps/cli/src/locales/en/messages.json`，未修改原有 CLI 命令实现或需求契约。

验证使用 Node 24，限定 `apps/bwadmin` 的 Jest 共 95 tests 通过，应用 TypeScript 检查通过。尚未连接真实 Vaultwarden 实例，不能据此声称完成服务端端到端验证。
