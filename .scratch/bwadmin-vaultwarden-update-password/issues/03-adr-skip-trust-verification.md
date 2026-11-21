# 03: ADR 记录跳过 trust 校验的权衡

**What to build:** 仓库首篇 ADR（目录按需创建），记录 bwadmin 对不支持 trust 校验数据端点的服务器跳过 trust 校验这一决策：背景（Vaultwarden 仓库级缺失该端点）、被否决的替代方案（等上游实现）、为何 CLI 侧可接受（CLI trust 确认即使成功也只产出空 trusted keys）。如实现中出现新术语（Trust Verification），同步沉淀入 GLOSSARY。

**Blocked by:** 01, 02.

**Status:** ready-for-agent

- [ ] ADR 覆盖三要素：难逆、无上下文会意外、真实权衡
- [ ] 与 01/02 实际落地行为一致（在 01/02 完成后撰写）
- [ ] GLOSSARY 更新（若有）遵循既有格式，仅术语不含实现细节
