# Spec: bwadmin Vaultwarden update-password 兼容

Status: ready-for-agent

## Problem Statement

自托管用户在 Vaultwarden 实例上运行 `bwadmin update-password` 时，命令必然失败并报 "API error during key rotation"，且失败发生在密码校验之前——无论密码是否正确。根因是上游 Vaultwarden 未实现 trust 校验数据读取端点（Bitwarden 官方新密钥轮换 API 的一部分），客户端 SDK 的 trust 校验调用直接抛错。

此外，不带参数运行 `update-password` 时，CLI 只报错退出，不会像官方 `bw` 那样交互式询问密码，用户的第一直觉操作（裸命令改密）走不通。

## Solution

`bwadmin` 的 update-password 在 trust 校验因服务器能力缺失而失败时，降级为跳过 trust 校验并继续完成改密与 vault 重加密，同时向用户输出一行 warning 说明校验被跳过。缺参数时，交互模式下依次询问 current password 与 new password。降级行为仅存在于 bwadmin CLI，不影响共享 lib 与其他客户端。

## User Stories

1. As a Vaultwarden 自托管用户, I want 在不支持新密钥轮换端点的服务器上成功修改 master password, so that 我不必等待服务器升级即可轮换密钥。
2. As a Vaultwarden 自托管用户, I want 跳过 trust 校验时看到明确的 warning, so that 我知道本次改密未做组织/紧急联系人公钥确认。
3. As a bwadmin 用户, I want 不带参数运行 update-password 时被交互询问旧密码与新密码, so that 我不必查文档记参数顺序。
4. As a 脚本化使用 bwadmin 的用户, I want 非交互模式下缺参数仍得到清晰的必需参数错误, so that 我的脚本以确定的退出码失败而不是挂起等待输入。
5. As a 官方 Bitwarden 服务器用户, I want trust 校验在支持的服务器上照常执行, so that 我的组织公钥确认流程不被削弱。
6. As a bwadmin 维护者, I want 降级逻辑只存在于 CLI 应用层而不进入共享 lib, so that Web/桌面客户端的安全行为不受影响。
7. As a bwadmin 维护者, I want 兼容行为有单测锁定, so that 未来升级 SDK 或共享 lib 时回归能被立即发现。
8. As a 未来读者, I want 一篇 ADR 解释为什么 bwadmin 容忍 trust 校验失败, so that 我不会误以为这是疏忽并"修复"它。

## Implementation Decisions

- trust 校验降级通过 bwadmin 本地的 key rotation service 子类实现：覆写 trust 校验方法，捕获 SDK 调用错误，输出 warning 后返回空 trust 结果（无 memberships、空 trusted keys），流程继续。共享 lib 的默认实现不动。
- 降级触发条件从宽：trust 校验阶段任何 SDK 错误都降级，不做端点预探测。理由：CLI 的 trust 确认即使在"成功"路径下也只产出空 trusted keys（现有 CLI trust dialog 确认后即返回空列表），降级与不降级的实际输出一致。
- warning 输出到 stderr，一行，语义为"服务器不支持 trust 校验数据端点，已跳过组织/紧急联系人 trust 校验"；文案风格随现有 CLI trust dialog 的硬编码英文。
- 无参数时的交互询问复用 CLI 现有 inquirer 先例（prompt 输出到 stderr），交互开关沿用现有 `BW_NOINTERACTION` 约定；非交互模式保留现有必需参数错误与退出码。
- 向上游 vaultwarden 提交缺失端点的 issue（动作项，不阻塞本变更）。
- 撰写仓库首篇 ADR 记录"对不支持服务器跳过 trust 校验"的权衡；如出现新术语（Trust Verification）沉淀入 GLOSSARY。

## Testing Decisions

- 只测外部行为：命令输出（stdout/stderr）与对 SDK client 的调用参数，不测子类内部结构。
- 测试 seam 复用现有 update-password 的 describe：mocked ServiceContainer + fake SDK client（现成的 `fakeSdkClient` 辅助），不新增 seam。
- 新增用例：
  - trust 校验 SDK 调用 reject → 改密 SDK 调用仍发生、stderr 含 warning、命令成功。
  - 无参数 + 非交互 → 现有必需参数错误。
  - 无参数 + 交互 mock 输入 → 走完改密调用（若现有 spec 无 inquirer mock 先例，则以非交互路径断言为准并注明）。
- Prior art：`admin.program.spec.ts` 中 update-password 现有两个用例（成功委托 SDK、失败时报错）。

## Out of Scope

- 修改共享 lib `user-crypto-management` 的默认行为（明确禁止，验收含共享 lib 无 diff）。
- 在 Vaultwarden 侧实现 `GET /api/accounts/key-management/key-rotation-data`（仅提 issue）。
- 其他命令的兼容性排查（bwadmin 仅 update-password 走 trust 校验路径，已确认）。
- 改密后的 relogin/session 刷新行为变更。

## Further Notes

- 诊断结论的完整证据链（端点探测 404 vs 401、上游 origin/main grep 零命中）见本 spec 对应的 openspec change `bwadmin-vaultwarden-update-password` 的会话记录；验收时可对 `bitwarden.garudalinux.org` profile 手动验证改密成功。
