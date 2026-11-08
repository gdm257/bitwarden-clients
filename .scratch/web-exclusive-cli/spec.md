# Spec: add-web-exclusive-cli

Status: ready-for-agent

## Problem Statement

我只使用第三方托管的 Vaultwarden 实例。Web vault 的 JS 由服务器下发，技术上随时可被植入后门（尤其是窃取 master password），因此我被迫在不可信的界面上执行管理员操作。官方 `bw` CLI 不覆盖 web 独占功能（org 管理、event logs、账户安全），这些操作只能打开 web vault。

## Solution

在本 clients monorepo fork 内新增一个 TypeScript CLI 应用（Commander 架构，复用 `apps/cli` 骨架与 `libs/` 共享服务），覆盖 web 独占功能中被 Vaultwarden 支持的部分：Event logs 查询、Org 管理、账户安全管理。本地构建自用，代码固定版本可审计，消除"服务端下发恶意 JS"的攻击向量。

## User Stories

1. As an org admin, I want to list my organizations, so that I can pick the org id for subsequent commands
2. As an org admin, I want to list org members with their status and role, so that I can audit access without the web vault
3. As an org admin, I want to invite, reinvite, and remove members, so that I can manage membership from the terminal
4. As an org admin, I want to confirm member keys (single and bulk), so that the most security-critical write operation never touches a web page
5. As an org admin, I want to revoke and restore members (single and bulk), so that I can suspend access quickly
6. As an org admin, I want to CRUD groups, so that I can organize access without the web vault
7. As an org admin, I want to manage collection permissions (assign groups/users, bulk access updates), so that access rules stay manageable
8. As an org admin, I want to view and update org policies, so that I can enforce password/2FA policies from the CLI
9. As an org admin, I want to view and update org settings, so that I don't need the web console for configuration
10. As an org admin, I want to query org event logs with start/end filters and continuation, so that I can audit activity locally
11. As an org admin, I want to query a specific member's event logs, so that I can investigate one user's actions
12. As an org admin, I want to query a specific cipher's event logs, so that I can investigate one item's history
13. As a user, I want to list my active 2FA providers, so that I know what's enrolled
14. As a user, I want to enroll and disable authenticator (TOTP) 2FA, so that I can manage it without a browser
15. As a user, I want to enroll and disable email 2FA, so that I can manage it without a browser
16. As a user, I want to view and disable all 2FA providers with my recover code, so that I can recover a lockout
17. As a user, I want to change my master password, so that I never type it into a server-served page
18. As a user, I want to view and update my KDF settings, so that I can harden my account
19. As a user, I want to view and update equivalent-domain rules, so that URI matching works as expected
20. As a user, I want to request and submit an OTP for sensitive operations, so that master-password-restricted endpoints work
21. As a user, I want login/unlock/sync identical to `bw`, so that muscle memory and session handling carry over
22. As a user, I want `--raw`/JSON output on every command, so that outputs are scriptable
23. As a user, I want clear errors when the Vaultwarden instance rejects something (e.g. unverified email, unsupported endpoint), so that failures are diagnosable
24. As a user, I want table output by default, so that interactive use is readable

## Implementation Decisions

- 新增 `apps/<cli>/` 应用（TypeScript, Commander），复用 `apps/cli` 的 login/unlock/sync/config 骨架与依赖注入结构；不修改现有 `apps/cli`
- 全部功能通过复用 `libs/` 中的现有服务实现（admin-console、auth、key-management、common 的 ApiService）；**不新增任何 encryption logic**，加密敏感流程（member confirm、改密）复用现有 crypto 路径
- Event logs 走 `getEvents*` 系列端点；不做 "My events"（Vaultwarden 无此路由）
- 2FA 管理只做 authenticator (TOTP) 与 email 的 enroll/disable，以及全部 provider 的查看/disable；不做 WebAuthn/Duo enroll
- Admin Password Reset 不在本期范围（backlog）
- 认证：username + master password 登录（password grant + 2FA challenge），支持 refresh token；不做 API-key-only 模式
- 组织上下文：所有 org 命令显式 `--orgid`，不引入默认 org 状态
- 输出：表格默认，`--raw`/`--json` 输出 JSON，沿用 `apps/cli` 的 Response/MessageResponse 模式
- 分发：仅在 fork 内 `nx build` 自用，不发布 npm
- 按 Bitwarden 官方 server API 编写，不做 Vaultwarden 专项适配；服务端错误如实透出（含 `SIGNUPS_VERIFY` 拒绝提示）
- Out of scope（Vaultwarden stub/禁用）：billing、Secrets Manager、Family sponsorship、providers events、passkey 登录、SSO/SCIM、Reports/vault health、Emergency Access

## Testing Decisions

- 测试打在最高 seam：CLI command 层（Commander program），与 `apps/cli` 现有 command 测试同构——mock ApiService/下游服务，断言命令输出与 API 调用参数，不测内部实现
- 加密敏感命令（confirm、change password）只断言委托给了现有 crypto 服务，不断言加密细节
- Prior art：`apps/cli/src/**/*.spec.ts` 的 program 测试模式
- 不需要新 seam；不引入 e2e

## Out of Scope

- Admin Password Reset、Emergency Access、Reports/vault health（backlog）
- 2FA 的 WebAuthn/Duo/YubiKey enroll
- "My events"（用户全账号事件）
- billing / Secrets Manager / Family sponsorship / providers / SSO / SCIM
- npm 发布、reproducible builds
- Vaultwarden 特有行为适配

## Further Notes

- 威胁模型边界：本 CLI 消除"服务端下发 JS 后门"向量，但服务器仍可见 ciphertext、metadata 与非 E2E 数据（event logs、org 配置）
- 兼容性结论来源：`bw_web_builds` patches 与 Vaultwarden server 路由核查（见 `.scratch/web-exclusive-features/research.md`）
