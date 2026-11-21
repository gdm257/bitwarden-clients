# bwadmin

独立于 `bw` 的自托管 Bitwarden/Vaultwarden 组织管理 CLI，账号注册流程的术语如下。

## Language

**Registration Start**：
提交邮箱以发起账号注册；服务器决定是发送验证邮件，还是直接返回 token 跳过邮件。
对应 CLI 的 `bwadmin register <email>`。
_Avoid_: sign up, signup start

**Registration Finish**：
提交 token 与 master password 派生数据，完成账号落库。
对应 CLI 的 `bwadmin register <url>`，或 Registration Start 后粘贴链接/裸 token 的收尾。
_Avoid_: register, complete signup

**Registration Token**：
短时有效的注册凭据，位于 finish-signup 链接的 `token` 参数或验证邮件正文中。
以裸 token 粘贴给 CLI 时，CLI 使用发起注册的邮箱完成 Registration Finish。
_Avoid_: verification token, invite token

**Finish-signup Link**：
指向 web vault `#/finish-signup/` 的链接，query 携带 `email` 与 `token`。
CLI 从中解析这两个参数完成 Registration Finish；链接中的 `email` MUST 与发起注册的邮箱一致。
_Avoid_: signup URL, invitation link
