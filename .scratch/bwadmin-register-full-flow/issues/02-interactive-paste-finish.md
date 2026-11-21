Status: resolved

# 02 邮件验证实例的交互粘贴收尾

## What to build

204（邮件已发送）分支进入终端提示，接受用户粘贴完整 finish-signup URL 或裸 token；URL 带 email 时校验与发起邮箱一致；解析成功后复用 Registration Finish 管线完成注册。含 prompt 设桩单测（含邮箱不匹配报错）。

## Acceptance criteria

- [x] 204 分支进入粘贴提示，BW_NOINTERACTION 下给出明确错误
- [x] 接受完整 URL 与裸 token 两种输入
- [x] URL 的 email 参数与发起邮箱不一致时报错退出
- [x] 成功完成注册并输出既有成功文案

## Blocked by

- 01（start 命令与响应分流）

## Answer

已实现于 commit 5a409483b9，并合入集成分支（merge 84f9f83f4b）。

- `finishFromPastedInput`：`BW_NOINTERACTION=true` 直接报错不挂起；交互时一次 input prompt，接受 finish-signup URL 或裸 token（`isLinkLike` 判定）。
- URL 的 email 与发起邮箱不一致（大小写不敏感）报错退出；URL 缺 email 参数时用发起邮箱。
- 解析成功后调用既有 `finishRegistration`。
- `npx nx test bwadmin` 全绿（新增 5 个用例）。

E2E（vault.vaultwarden.com，开启邮件验证，临时邮箱）：完整链接粘贴与裸 token 粘贴各成功建号一次，输出 "Account created for <email>"；裸 token 运行同时验证了 `--generate` 的初始密码插值输出。
