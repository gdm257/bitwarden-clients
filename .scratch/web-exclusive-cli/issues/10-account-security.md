# 10: Account 安全管理

**What to build:** 修改 master password（复用现有 crypto 流程，含 vault 重加密）、查看/更新 KDF 设置（含 Argon2id 参数）、查看/更新 equivalent-domain rules、request/submit OTP。

**Blocked by:** 01 CLI app skeleton

**Status:** done

- [x] 修改 master password 全流程可用，走现有 crypto 路径，不新增加密逻辑
- [x] KDF 查看与更新可用
- [x] domain rules 查看与更新可用
- [x] request OTP / verify OTP 可用
- [x] command 层测试只断言对现有服务的委托与 API 调用

## Comments

### Review remediation

本次修复补齐 Commander 参数绑定、group API envelope、成员设置输出、`--json` alias、2FA structured output、PolicyType 校验及 i18n，并改用 typed Jest mocks。关联实现位于 `apps/bwadmin/src/`，英文 locale 复用 `apps/cli/src/locales/en/messages.json`，未修改原有 CLI 命令实现或需求契约。

验证使用 Node 24，限定 `apps/bwadmin` 的 Jest 共 95 tests 通过，应用 TypeScript 检查通过。尚未连接真实 Vaultwarden 实例，不能据此声称完成服务端端到端验证。
