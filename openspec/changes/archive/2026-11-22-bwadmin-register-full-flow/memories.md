# memories

## 相关 specs

- openspec/specs/bwadmin/account-registration/spec.md — 既有 finish-signup 收尾能力（register <url>），本 change 在其上扩展发起侧
- openspec/specs/bwadmin/account-security/spec.md — 主密码处理约定，新流程 MUST 沿用

## 相关代码

- apps/bwadmin/src/register.command.ts — Registration Finish 管线（prelogin KDF → master key → registerFinish），发起侧 MUST 复用
- apps/bwadmin/src/admin.program.ts — commander 注册模式
- apps/cli/src/locales/en/messages.json — bwadmin i18n 文案与 placeholders 声明

## 本 change 的实测背景（2026-11-21 会话）

- 服务端流程（vaultwarden 1.37.5）：POST /identity/accounts/register/send-verification-email body {email, name, receiveMarketingMaterials} → signups_verify 开启时 204（token 进邮件），关闭时 200 且 body 直接返回 token
- finish-signup 链接形态 <domain>/#/finish-signup/?email=<enc>&token=<JWT>；token 为 30 分钟 RS256 JWT，iss=<origin><register_verify 分隔符>
- 服务端部署的 RSA 签名密钥可能因重启/多后端而更换，旧 token 报 InvalidSignature；同批次签发的 token 立即提交稳定通过
- 已知构建问题：dist/apps/bwadmin/**/locales/en/messages.json 副本不随 nx build 刷新，导致 i18n placeholders 修复（commit 27fa90d17e）在运行时未生效
