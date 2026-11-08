# Web vault 独占功能调研（web vs CLI）

背景：用户不信任第三方 Vaultwarden 实例下发的 web vault JS（服务端可植入后门窃取 master key / 解密后的 vault 数据），希望为 web 独占功能写一个本地可信代码的 CLI client。

对比基准（本仓库）：

- Web app: `apps/web/`
- CLI (`bw`): `apps/cli/`

## CLI (`bw`) 已覆盖的能力

来源：`apps/cli/src/program.ts`、`apps/cli/src/vault.program.ts`、`apps/cli/src/tools/send/send.program.ts`、`apps/cli/src/serve.program.ts`、`apps/cli/src/dirt/report.program.ts`。

- 认证/会话：`login` `logout` `lock` `unlock` `sync` `status` `config`（`program.ts:110-487`）
- vault CRUD：`list` `get` `create` `edit` `delete` `restore` `share`（含 attachment、folder、org、item，`vault.program.ts:91-625`）
- org 成员确认：`confirm org-member`（`vault.program.ts:550`）
- `import` / `export`（`vault.program.ts:584, 625`）
- Send 全套：`send create/edit/list/get/delete/remove-password/receive`（`send.program.ts:41-286`）
- `generate`、`encode`、`serve`（本地 API server）、`update`、`completion`
- DIRT report：`apps/cli/src/dirt/report.program.ts`（访问洞察相关，依赖 Bitwarden 云服务）

## Web 独占功能清单

以下功能只存在于 `apps/web/` 的 UI，CLI 无对应子命令。逐项注明实现位置、底层逻辑是否在 shared lib、以及 Vaultwarden 是否支持。

### 1. Organization / Admin Console（组织管理）

路由：`apps/web/src/app/admin-console/organizations/organization-routing.module.ts`（`vault` `settings` `members` `groups` `reporting` `billing`）。

| 功能 | web 实现位置 | 底层 service/API | Vaultwarden |
|---|---|---|---|
| 创建 organization | `apps/web/src/app/admin-console/organizations/create/` | `api.service`（`libs/common/src/abstractions/api.service.ts`） | 支持 |
| 成员管理（邀请/角色/移除/重发邀请/bulk 操作） | `apps/web/src/app/admin-console/organizations/members/` | shared：`libs/common/src/admin-console/`（organization service abstractions） | 支持（Member Roles） |
| Groups 管理 | `apps/web/src/app/admin-console/organizations/manage/` | shared lib API | 支持 |
| Collections 权限管理 | `apps/web/src/app/admin-console/organizations/collections/` | shared lib API | 支持 |
| Policies（策略配置） | `apps/web/src/app/admin-console/organizations/policies/` | shared：`libs/common/src/admin-console/services/policy/policy-api.service.ts`（`getPolicies` 等，REST 可直接调用） | 支持（部分策略） |
| Event logs（组织事件审计） | `apps/web/src/app/admin-console/organizations/reporting/` | shared：`libs/common/src/abstractions/api.service.ts:302-360`（`getEvents*` 系列端点）与 `libs/common/src/dirt/event-logs/` | 支持（Event Logs） |
| Admin Password Reset（管理员重置成员密码/接管 vault） | members 模块内 | shared lib API（org user reset endpoints） | 支持 |
| Org settings（名称/计划/删除 org/2FA 要求） | `apps/web/src/app/admin-console/organizations/settings/`（`organization-settings.routes.ts`：`account` `two-factor` `policies` `tools/import`） | shared lib API | 支持（billing 相关除外） |
| Org 内 import/export 工具 | org settings `tools` 路由 | 复用 `libs/importer` | 支持 |
| SSO（SAML/OIDC）配置 | org settings 内 + `apps/web/src/app/auth/sso/` | `api.service.ts:371`（`getSsoUserIdentifier` 等） | 不支持（Vaultwarden SSO 为实验性/独立分支，主线 README 未列） |
| SCIM（目录同步供给） | org settings 内 | `libs/common/src/admin-console/enums/organization-connection-type.enum.ts`（`OrganizationConnectionType.Scim`） | 不支持（SCIM Bridge 是 Bitwarden 云组件） |

### 2. Emergency Access（紧急访问）

- web UI：`apps/web/src/app/auth/settings/emergency-access/`、邀请流程 `apps/web/src/app/auth/emergency-access/`
- 底层 API：`libs/common/src/abstractions/api.service.ts:165`（emergencyAccess 端点）——REST 可直接调用，CLI 完全没暴露。
- Vaultwarden：支持（README Features 列明 Emergency Access）。
- 对用户威胁模型特别重要：trusted contact 接管流程目前只能靠 web UI。

### 3. 账户安全设置

- Two-factor 管理（Authenticator/Email/FIDO2 WebAuthn/YubiKey/Duo）：`apps/web/src/app/auth/settings/two-factor/`
- WebAuthn 登录（passkey）管理：`apps/web/src/app/auth/settings/webauthn-login-settings/`
- 密码修改、删除账户、验证邮箱：`apps/web/src/app/auth/settings/`（web 路由 `verify-email` `recover-delete` 等，`apps/web/src/app/oss-routing.module.ts`）
- Vaultwarden：2FA 各 provider 均支持（README）。

### 4. Reports / Vault health（密码健康报告）

- web UI：`apps/web/src/app/dirt/reports/`（个人 reports 路由 `reports`，org 侧 `reporting`）
- 底层引擎在 shared lib，客户端本地计算：`libs/common/src/services/audit.service.ts`（HIBP k-anonymity，直连 `https://api.pwnedpasswords.com/range/`）、`libs/common/src/dirt/vault-health/`。
- 注意：暴露密码/弱密码等报告本质是本地扫描 + HIBP 查询，写 CLI 很容易复用 `libs/common` 的实现；但部分 report（如 data breach 报告、access intelligence）依赖 Bitwarden 云端 entitlement，Vaultwarden 上不可用。

### 5. Billing / Subscription / Premium

- `apps/web/src/app/billing/`（个人订阅、org 订阅、payment、trial、invoice）。
- 全部走 Bitwarden 商业化后端；Vaultwarden 不支持（premium 功能在其侧通过配置开关免费放开）。

### 6. 其他 web 独占

- Domain rules（equivalent domains）：`apps/web/src/app/settings/domain-rules.component.ts`；CLI `config` 只改 server/客户端设置，不能编辑 equivalent domains（存于用户 profile API）。
- Families sponsorship / Families for Enterprise：`apps/web/src/app/admin-console/organizations/sponsorships/`；Vaultwarden 不支持。
- Password hint 请求、接受 org 邀请链接（`join/:organizationId/:inviteLinkCode`）、接受 emergency access 邀请：`oss-routing.module.ts`；多为简单 REST 调用。
- Secrets Manager 控制台：`apps/web/src/app/secrets-manager/`；官方另有独立 CLI `bws`，不在本仓库 `bw` 内。Vaultwarden 自 2024 起支持 SM 端点（主线 README 未列，建议实测）。
- PAM / Access Intelligence（`apps/web/src/app/pam/`、DIRT 系列）：依赖 Bitwarden 云，Vaultwarden 不支持。

## REST API 可达性（给 CLI client 的实现建议）

几乎所有 web 独占功能最终都落在 Bitwarden 公开 REST API 上（web 前端只是消费者），且大量调用逻辑已在本仓库 shared libs 中实现，可直接复用而非手写 HTTP：

- 认证：`libs/auth`（支持 api-key 登录 `client_credentials`，对 CLI 最合适）
- policies：`libs/common/src/admin-console/services/policy/policy-api.service.ts`
- events：`api.service.getEvents*`（`libs/common/src/abstractions/api.service.ts:302-360`）
- emergency access：`api.service`（`api.service.ts:165` 附近）
- 组织/成员/组/集合：`libs/common/src/admin-console/abstractions/organization/`
- 报告引擎：`libs/common/src/services/audit.service.ts`、`libs/common/src/dirt/vault-health/`
- 不可复用需绕过的：billing、SCIM、SSO 配置、PAM —— 这些要么 Vaultwarden 不支持，要么走 Bitwarden 专属云服务。

注意加密边界：emergency access takeover、admin password reset、成员 confirm（`apps/web/src/app/admin-console/organizations/manage/user-confirm.component.ts`）涉及组织公钥/用户密钥的加解密流程，实现时须复用 `libs/key-management` / `libs/common/src/auth` 中已有的 crypto 流程，而不是自行写加密逻辑（本仓库 CLAUDE.md 也禁止新增 encryption logic）。

## 威胁模型备注

- 用户担心的后门向量成立：web vault 是服务端下发的 JS，在任何 HTTP 响应里替换脚本即可获得输入的 master password；CLI/binary 是本地代码，`bw login` + api-key 认证不经过服务器代码。
- 但要区分两个信任边界：
  1. **客户端代码可信**：自建 CLI（或官方 `bw`）解决。
  2. **服务器本身**：Vaultwarden 即使不开后门，作为第三方实例仍能看到/篡改 ciphertext、metadata、以及 org 内非端到端加密的数据（event logs、组织配置、未启用 zero-knowledge 的部分）。CLI 不能消除这一层。
- Vaultwarden 兼容官方 API（README：nearly complete implementation），所以针对上述 REST 端点写的 CLI 对官方 Bitwarden 与 Vaultwarden 都可用，但 SSO/SCIM/billing/PAM 类端点在 Vaultwarden 上不存在。

## Sources

- 本仓库代码（路径如上，含行号）
- Vaultwarden README（features 列表）：https://github.com/dani-garcia/vaultwarden#features
- Bitwarden CLI 文档：https://bitwarden.com/help/cli/
- Bitwarden help（各功能文档链接见 Vaultwarden README 中引用）
