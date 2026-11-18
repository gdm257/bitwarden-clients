# bwadmin register：不碰 web vault 完成账号注册

Status: ready-for-agent

## Problem Statement

vaultwarden 实例开启邮件验证时，服务端发的注册邮件里是形如 `https://vault.example.com/#/finish-signup/?email=xxx&token=xxx&fromEmail=true` 的 web vault URL。被邀请人只能在 web vault 里打开链接完成注册——与 bwadmin "代替 web vault" 的目标冲突：用户被迫在 server 下发的页面上运行不受控的 JS 并输入 master password。desktop 客户端虽然能发起注册请求，但验证邮件链接永远落在 web vault URL，token 到不了 desktop；接受组织邀请在 desktop 更是 web-only by design。

## Solution

bwadmin 新增 `register` 命令：把邮件里的 finish-signup 链接直接粘贴给 CLI，由 CLI 解析出 email 与 token，交互式设置 master password（或由 CLI 指定 / 随机生成转交），复用 `libs/auth` 现有的 KDF 派生与注册请求流程调用 `/accounts/register/finish` 完成建号。全程不打开 web vault。

## User Stories

1. As a 被邀请人, I want 把注册邮件里的链接粘贴给 `bwadmin register`, so that 不用打开 web vault 就能完成注册
2. As a 被邀请人, I want 在 CLI 交互提示里输入自己想好的 master password, so that 密码从头到尾只有我自己知道
3. As a org admin, I want 用 `--password` 指定初始 master password 替用户建号, so that 无技术背景的用户也能被引导入场
4. As a org admin, I want 用 `--generate` 让 CLI 随机生成初始密码并打印一次, so that 转交后用户首登即可修改
5. As a bwadmin 用户, I want register 之后提示下一步命令（如 `bwadmin confirm`）, so that 我知道整个成员引导流程还剩哪些步骤
6. As a bwadmin 用户, I want 链接格式不合法或 token 缺失时报清晰错误, so that 我能立刻发现粘贴错了
7. As a bwadmin 用户, I want 注册成功后输出账号 email 与后续提示, so that 交接凭据时信息完整
8. As a `--generate` 使用者, I want 输出里明示"请让用户首次登录后修改密码", so that 初始密码的临时性不被误解

## Implementation Decisions

- 命令形态：`bwadmin register <url>`，url 为邮件里的完整 finish-signup 链接；从 query string 解析 `email` 与 `token`
- master password 三种模式：默认交互式输入（两次确认）；`--password <pwd>` 非交互指定；`--generate` 随机生成并一次性打印，附"让用户首登后修改"提示
- 复用 `libs/auth` / `libs/common` 现有注册管线：prelogin 获取 KDF 参数、master key 派生、`/accounts/register/finish` 请求模型；禁止在 bwadmin 内新写 crypto
- 命令边界单一：register 只做注册。vaultwarden 上被邀请邮箱注册时 Invitation 自动消耗、成员自动 Accepted，收尾用现有 `bwadmin confirm`；三步流程（invite → register → confirm）写入命令帮助与文档
- 不改 desktop / web 客户端；不做官方 Bitwarden server 的显式 accept 流程（官方用户可用官方 web vault）
- `--password` / `--generate` 模式下操作者可知晓初始密码，属零知识模型的有意取舍，文档写明

## Testing Decisions

- 只测外部行为：链接解析（合法 / 缺 token / 缺 email / 非 finish-signup URL）、三种密码模式的参数校验与错误输出
- 注册流程测到 service 层与 API 请求的边界：mock API，断言发出的 finish 请求体（KDF 参数、email、token、master password 相关字段）正确
- 先例：bwadmin 既有 command 测试（member-write 等）的模式
- crypto 派生不新写测试，由复用的 libs 既有测试覆盖

## Out of Scope

- desktop 客户端的 deep link / 粘贴 token UI
- 组织邀请的显式 accept 命令（vaultwarden 依赖 Invitation 自动消耗；官方 server 场景不管）
- SMTP / 邮件发送相关功能
- 注册邮件的发起（send-verification-email）命令化

## Further Notes

- vaultwarden 关闭邮件验证时，注册 token 直接在 send-verification-email 响应体返回，desktop 可自闭环；本 spec 针对的是"邮件验证开启、链接只能落 web"的主场景
- 背景 grill 结论：bwadmin 定位为 web vault 的 admin console 替代；成员引导的 admin 侧步骤（invite/confirm）已存在
