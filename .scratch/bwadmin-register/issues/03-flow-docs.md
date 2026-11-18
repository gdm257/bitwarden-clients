# 03: 三步引导流程文档与帮助

**What to build:** 命令 help 与 bwadmin 文档写清"bwadmin invite → 被邀请人 bwadmin register（或转交初始密码）→ bwadmin confirm"的成员引导全流程，说明 vaultwarden 上注册时 Invitation 自动消耗、成员自动 Accepted，以及 --password/--generate 的零知识取舍。

**Blocked by:** 01

**Status:** resolved

- [x] register 命令 help 覆盖三种密码模式与链接格式
- [x] bwadmin 文档含三步引导流程说明
- [x] 文档写明初始密码转交的安全取舍

## Answer

实现于分支 `register-03`，commit `6bc403d3`（`docs(cli-admin): document member onboarding flow for register`）。新建 `apps/bwadmin/README.md`：三步引导流程（invite → register → confirm）、finish-signup 链接格式、三种密码模式、vaultwarden Invitation 自动消耗说明、初始密码转交的零知识取舍；扩展 register 命令 i18n description 覆盖链接格式与模式。bwadmin 测试不受影响（101 passed）。
