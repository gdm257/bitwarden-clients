# 09: 2FA 管理

**What to build:** 列出当前启用的 2FA providers；enroll/disable authenticator (TOTP) 与 email；用 recover code 一次性 disable 全部 2FA。不做 WebAuthn/Duo/YubiKey enroll。

**Blocked by:** 01 CLI app skeleton

**Status:** done

- [x] 列出已启用 providers
- [x] TOTP enroll（展示 secret/二维码内容）与 disable 可用
- [x] email 2FA enroll/disable 可用
- [x] recover code disable-all 可用，需二次确认
- [x] command 层测试覆盖对应端点调用

## Comments

### Review remediation

本次修复补齐 Commander 参数绑定、group API envelope、成员设置输出、`--json` alias、2FA structured output、PolicyType 校验及 i18n，并改用 typed Jest mocks。关联实现位于 `apps/bwadmin/src/`，英文 locale 复用 `apps/cli/src/locales/en/messages.json`，未修改原有 CLI 命令实现或需求契约。

验证使用 Node 24，限定 `apps/bwadmin` 的 Jest 共 95 tests 通过，应用 TypeScript 检查通过。尚未连接真实 Vaultwarden 实例，不能据此声称完成服务端端到端验证。
