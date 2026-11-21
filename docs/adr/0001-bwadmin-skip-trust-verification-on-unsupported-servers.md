# 1. bwadmin 在不支持 trust 校验数据端点的服务器上跳过 Trust Verification

## Status

Accepted

## Context

`bwadmin update-password` 复用 SDK 的 user key rotation 路径：改密前先调用 trust 校验数据端点（`GET /api/accounts/key-management/key-rotation-data`）获取未信任的组织与紧急联系人 memberships。Vaultwarden 至今未实现该端点（仓库级缺失，非实例版本滞后），请求返回 404，SDK 抛出 "API error during key rotation"，导致改密在任何密码校验之前就失败。

替代方案是等上游 Vaultwarden 实现该端点，期间 bwadmin 对 Vaultwarden 完全不可用。

## Decision

bwadmin 使用本地子类 `BwadminUserKeyRotationService`（`apps/bwadmin/src/account-security/`）覆写 `verifyTrust`：捕获任何 SDK 错误，向 stderr 输出一行 warning 说明 trust 校验被跳过，然后以空 trusted keys 继续改密。共享 lib（`libs/user-crypto-management`）的默认行为不变。

选择"任何 SDK 错误都降级"而非"探测端点后精确匹配 404"：免于维护端点探测与错误分类，且失败模式一致（拿不到 memberships 数据时，唯一可继续的方式就是跳过校验）。

## Consequences

- 难逆：一旦用户依赖此降级路径在 Vaultwarden 上改密，收回降级会重新破坏该场景；除非上游实现端点，否则不应收紧。
- 安全权衡：跳过校验意味着不展示未信任 memberships 的指纹确认。这在 CLI 场景下是可接受的，因为 CLI trust dialog 即使成功也只产出空 trusted keys（确认只为提示用户主动核对）；对无组织/无紧急联系人的账号（bwadmin 的典型自托管场景），校验本身是 no-op。若上游实现该端点，正常校验路径自动恢复，无需改动。
- 上游 Vaultwarden 补齐端点后，warning 与跳过逻辑仍无害，但届时应重新评估是否移除降级。
