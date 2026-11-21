## MODIFIED Requirements

### Requirement: 修改 master password

CLI MUST 支持修改 master password，MUST 复用现有 crypto 流程完成 vault 重加密，禁止新增加密逻辑。

当服务器的 trust 校验数据端点（key-rotation-data）不可用或 SDK trust 校验调用失败时，CLI MUST 跳过 trust 校验、输出一行 warning 后继续改密；此降级 MUST 仅作用于 bwadmin CLI，MUST NOT 改变共享 lib 的行为。缺 current/new password 参数时，CLI MUST 在交互模式下询问两个密码；非交互模式下报必需参数错误。

#### Scenario: 改密成功

- **WHEN** 用户提交旧密码与新密码
- **THEN** 账户密码更新，vault 数据以新密钥重新加密上传

#### Scenario: Vaultwarden 兼容（trust 校验不可用）

- **WHEN** 服务器未实现 key-rotation-data 端点导致 trust 校验失败
- **THEN** CLI 输出 warning 并跳过 trust 校验，改密流程照常完成

#### Scenario: 无参数交互询问

- **WHEN** 交互模式下用户不带参数运行 update-password
- **THEN** CLI 依次询问 current password 与 new password 后继续改密流程
