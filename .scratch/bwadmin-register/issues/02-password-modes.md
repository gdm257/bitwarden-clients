# 02: 非交互密码模式 --password 与 --generate

**What to build:** `bwadmin register <url> --password <pwd>` 直接用指定密码建号；`--generate` 随机生成初始密码并一次性打印，输出明示"请让用户首次登录后修改密码"。两种模式不出现交互提示，可用于脚本/代建号场景。

**Blocked by:** 01

**Status:** resolved

- [x] `--password` 模式全程无交互，注册成功
- [x] `--generate` 模式生成随机密码，仅在成功输出中打印一次
- [x] `--generate` 输出包含首登改密提示
- [x] `--password` 与 `--generate` 同时给出时报参数冲突错误

## Answer

实现于分支 `register-02`，commit `c6e57fcc`（`feat(cli-admin): add non-interactive password modes to register`）。`--password` 零 prompt 直接使用；`--generate` 复用 `PasswordGenerationServiceAbstraction.generatePassword`（64 位，与 login.command 同款），密码仅在成功输出打印一次并附首登改密提示；互斥校验在最前置 badRequest。新增 3 测试，bwadmin 全套 104 passed。
