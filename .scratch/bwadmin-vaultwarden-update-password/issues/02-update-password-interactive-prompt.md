# 02: update-password 无参数交互询问

**What to build:** 交互模式下不带参数运行 `bwadmin update-password`，CLI 依次询问 current password 与 new password（prompt 输出到 stderr，沿用现有 inquirer 先例与 `BW_NOINTERACTION` 约定），拿到输入后继续原改密流程；非交互模式缺参数仍报现有必需参数错误并以原退出码失败。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 无参数 + 交互模式 → CLI 询问两个密码并完成改密调用
- [ ] 无参数 + `BW_NOINTERACTION=true` → 现有必需参数错误，退出码不变
- [ ] 带参数运行时行为与之前完全一致（不出现询问）
- [ ] 密码输入不回显
