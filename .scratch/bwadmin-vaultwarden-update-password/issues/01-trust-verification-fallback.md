# 01: trust 校验降级兜底

**What to build:** 在不支持 trust 校验数据端点的服务器（如 Vaultwarden）上，`bwadmin update-password <old> <new>` 成功完成改密与 vault 重加密：trust 校验阶段的任何 SDK 错误被降级为跳过校验，stderr 输出一行 warning 说明校验被跳过，随后照常走现有 SDK 改密流程。降级只存在于 bwadmin CLI 的本地 key rotation service 子类，共享 lib 的默认行为不变。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] trust 校验 SDK 调用失败时，改密 SDK 调用仍发生且命令成功（退出码 0）
- [ ] 降级时 stderr 出现一行 warning，语义为"服务器不支持 trust 校验数据端点，已跳过组织/紧急联系人 trust 校验"
- [ ] trust 校验成功的服务器路径行为不变（现有用例全绿）
- [ ] 共享 lib（user-crypto-management）无任何改动
- [ ] warning 文案风格与现有 CLI trust dialog 的硬编码英文一致
