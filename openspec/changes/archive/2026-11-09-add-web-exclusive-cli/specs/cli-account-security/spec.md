# Spec Delta

## Purpose

CLI 管理账户自身安全：2FA 管理、master password 变更、KDF 与 domain rules，避免在 server 下发的 web 页面输入敏感信息。

## ADDED Requirements

### Requirement: 2FA 管理

CLI MUST 支持列出已启用 2FA providers、enroll/disable authenticator (TOTP) 与 email、用 recover code disable 全部 2FA。CLI MUST NOT 提供 WebAuthn/Duo/YubiKey 的 enroll。

#### Scenario: enroll TOTP

- **WHEN** 用户 enroll authenticator 2FA
- **THEN** 输出 secret 供用户录入验证器，验证码确认后启用

#### Scenario: recover 模式

- **WHEN** 用户提交 recover code 要求 disable 全部 2FA
- **THEN** CLI 要求二次确认后禁用全部 providers

### Requirement: 修改 master password

CLI MUST 支持修改 master password，MUST 复用现有 crypto 流程完成 vault 重加密，禁止新增加密逻辑。

#### Scenario: 改密成功

- **WHEN** 用户提交旧密码与新密码
- **THEN** 账户密码更新，vault 数据以新密钥重新加密上传

### Requirement: KDF 设置

CLI MUST 支持查看与更新 KDF 设置（含 Argon2id 参数）。

#### Scenario: 更新 KDF

- **WHEN** 用户更新 KDF 参数
- **THEN** 下次 unlock 使用新参数派生密钥

### Requirement: Domain rules

CLI MUST 支持查看与更新 equivalent-domain rules。

#### Scenario: 更新 rules

- **WHEN** 用户提交新的 equivalent domains
- **THEN** 后续 URI 匹配按新 rules 生效

### Requirement: OTP 流程

CLI MUST 支持 request OTP 与 verify OTP，供需要 OTP 的敏感操作使用。

#### Scenario: 请求 OTP

- **WHEN** 用户请求 OTP
- **THEN** 实例发送验证邮件，用户提交后验证通过
