Status: resolved

# 04 帮助文档与 Glossary 术语落地

## What to build

更新 register 帮助文本说明全流程用法（email/URL 两种参数、--name、邮件验证与直返两种实例形态）；将 Registration Start / Registration Finish 写入 GLOSSARY.md。

## Acceptance criteria

- [x] bwadmin register --help 覆盖两种参数形态与选项
- [x] GLOSSARY.md 含 Registration Start / Registration Finish 定义

## Blocked by

- 01、02（两种实例形态的最终行为）

## Answer

已实现于 commit 427de74eb3，并合入集成分支（merge 75ba234ee9）。

- README 的 onboarding 第 2 步补充 email 发起、邮件验证粘贴收尾、无邮件验证一步建号、URL 收尾与自托管要求。
- register 命令描述与三个选项（`--password`/`--generate`/`--name`）文案在 01/02 已覆盖，`bwadmin register --help` 实测输出满足要求。
- 仓库根新增 GLOSSARY.md，定义 Registration Start / Registration Finish / Registration Token / Finish-signup Link。
