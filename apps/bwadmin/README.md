# bwadmin

`bwadmin` 是独立于 `bw` 的组织管理 CLI：成员、groups、collections、policies、org settings 与审计事件的读写，以及账号注册，全程不打开 server 下发的 web vault。

## Member onboarding

新成员入场分三步：

1. **invite** — admin 运行 `bwadmin invite`，向被邀请邮箱发送组织邀请（同时触发注册验证邮件）。
2. **register** — 被邀请人把注册邮件里的 finish-signup 链接粘贴给 CLI：

   ```sh
   bwadmin register 'https://vault.example.com/#/finish-signup/?email=alice@example.com&token=…&fromEmail=true'
   ```

   命令从链接的 query 参数解析 `email` 与 `token`，master password 有三种模式：

   - 交互式（默认）：提示输入两次 master password，密码从头到尾只有用户自己知道；
   - `--password <pwd>`：admin 非交互指定初始密码，适合替无技术背景的用户代建账号；
   - `--generate`：CLI 随机生成初始密码并在成功输出中打印一次，转交给用户。

   admin 也可以用 `--password` / `--generate` 代为执行第 2 步，再把初始密码转交给被邀请人。

3. **confirm** — admin 运行 `bwadmin confirm`，把成员设为 confirmed，完成入场。

在 vaultwarden 上，被邀请邮箱注册时 Invitation 会被自动消耗，成员状态自动变为 Accepted，因此无需（也没有）显式的 accept 命令；`register` 之后直接 `bwadmin confirm` 即可。

### 初始密码转交的零知识取舍

`--password` / `--generate` 模式下，执行命令的操作者可知晓用户的初始 master password——这是零知识模型的有意取舍，换取无技术背景用户也能顺利入场。初始密码应视为一次性凭据：转交后用户 MUST 在首次登录后修改 master password（`--generate` 的成功输出也会提示这一点）。
