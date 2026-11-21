Status: resolved

# bwadmin register 全流程注册

## Problem Statement

bwadmin 目前只能在拿到注册邮件里的 finish-signup 链接后"收尾"：被邀请人仍需打开邮箱、复制链接再交给 CLI。发起注册（提交邮箱、触发验证邮件）这一半流程不在 bwadmin 内，整个引导被拆散在 web vault、邮箱和 CLI 三处。

## Solution

`bwadmin register` 升级为参数自动分流的全流程命令：参数是 email 时发起 Registration Start（调用服务端 send-verification-email），按响应自动分流——需要邮件验证的实例进入交互提示，粘贴链接或裸 token 后完成 Registration Finish；无需邮件验证的实例（响应直接携带 token）跳过交互、一步建号。参数是 URL 时保持现有收尾行为不变。

## User Stories

1. As a 被邀请人, I want 在 bwadmin 里直接输入邮箱发起注册, so that 不必先去 web vault 填表。
2. As a 被邀请人, I want 发起后按提示粘贴邮件里的链接就完成注册, so that 整个引导只在一个终端里完成。
3. As a 被邀请人, I want 粘贴裸 token 也能被识别, so that 从邮件复制部分内容时不必拼 URL。
4. As a 被邀请人, I want 在无邮件验证的实例上无需任何邮件、一步完成注册, so that 自建实例的引导最短。
5. As a 被邀请人, I want `--password` 指定初始密码或 `--generate` 生成并打印, so that 脚本化与人工两种场景都被覆盖。
6. As a 被邀请人, I want `--name` 可选地携带账号名, so that 不必交互回答姓名且保持无交互可用。
7. As a 被邀请人, I want 粘贴链接里的 email 与发起邮箱不一致时报错, so that 拿错链接时不会建错账号。
8. As a 被邀请人, I want token 无效/过期/账号已存在时看到服务器原始报错并以非零码退出, so that 失败原因可诊断、可重试。
9. As a bwadmin 维护者, I want 发起与收尾复用同一条注册 crypto 管线, so that 不存在两套需要同步的派生逻辑。
10. As a bwadmin 维护者, I want `register <url>` 的既有行为完全不变, so that 已有的脚本与 spec 不受影响。
11. As a bwadmin 维护者, I want i18n 运行时文案在构建产物中生效, so that 生成的初始密码等信息不会因占位符未插值而丢失。

## Implementation Decisions

- 命令形态：`register <email|url>` 按参数形态自动分流（含 `@` 判定为 email）；不新增子命令。`--password`/`--generate`/`--name` 对两种形态通用，语义沿用既有定义。
- Registration Start：POST 服务端 send-verification-email 端点，body 携带 email、可选 name；请求 MUST 复用 register 既有的 self-hosted environment 设定方式（从参数/配置解析服务器 origin，禁止回落官方云）。
- 响应分流：204（邮件已发送）→ 交互提示粘贴；200 且 body 含 token → 直接进入 Registration Finish，无邮件无交互。
- 粘贴解析：接受完整 finish-signup URL 或裸 token；URL 带 email 参数时 MUST 校验与发起邮箱一致，不一致报错退出。
- 失败行为：Registration Finish 的服务端错误原样呈现、非零退出；不做本地预检、不做失败重试循环。
- 复用：Finish 侧全部 crypto（prelogin KDF、master key、keys）沿用现有 RegisterCommand 管线，不新增加密逻辑。
- 范围：仅面向自托管 Vaultwarden；不实现老式直连注册（RegisterDataOld 协议）。
- 顺带修复：构建产物中 bwadmin locales 副本不随构建刷新的问题（i18n placeholders 修复已在源码，运行时未生效）。
- 术语：Registration Start（发起：提交邮箱进入待验证状态）、Registration Finish（收尾：提交 token 与主密码派生数据，账号落库）。

## Testing Decisions

- 只测外部行为：以现有 RegisterCommand 的服务 mock 边界为 seam（apiService、environmentService、i18nService、密码生成服务），不 mock 内部函数；该 seam 已覆盖既有 register 行为，本 change 不新增 seam。
- 新增用例：email 参数触发 send-verification-email 调用与参数传递；204 分支进入提示、粘贴 URL/裸 token/邮箱不匹配三种解析；200 直返 token 分支跳过交互直达 finish；`--name` 透传；失败错误透传与非零退出。
- 交互粘贴沿用现有 spec 的 inquirer 设桩方式（prompt mock / 环境变量禁交互）。
- 先例：apps/bwadmin/src/register.command.spec.ts、apps/cli/src/locales/en/messages.spec.ts。
- 端到端验收：对开启 signups_verify 的 vaultwarden 实例用临时邮箱走 start → 粘贴 → finish 全程；对关闭验证的实例验证一步建号。

## Out of Scope

- Bitwarden 官方云（遇到即报错提示不支持自托管之外的目标）。
- 老式直连注册协议（RegisterDataOld）。
- IMAP/JMAP 自动抓取验证邮件（远期可选）。
- 失败后的自动重试循环与本地预检（verification-email-clicked）。
- 忘记密码/邮箱验证补发等注册后流程。

## Further Notes

- 服务端签名密钥可能因实例重启或多后端部署而更换：旧 finish-signup token 会以 InvalidSignature 失败，属服务端运维问题，CLI 只需原样呈现错误（实测背景见 memories.md）。
- Glossary 术语 Registration Start / Registration Finish 待本 change 落地时写入 GLOSSARY.md。
