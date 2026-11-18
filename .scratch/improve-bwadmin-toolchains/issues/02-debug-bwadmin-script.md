# 02: debug:bwadmin 隔离 profile 调试运行

**What to build:** 开发者运行 `npm run debug:bwadmin -- <args>` 即可构建（`NO_BUILD=1` 可跳过）并在隔离的 `.debug/bwadmin-profile` 数据目录下运行 bwadmin；另有 `--inspect` 调试入口可被 IDE attach。

**Blocked by:** 01

**Status:** resolved (commit 14b0d009de, merge 4e825f8177 on improve-bwadmin-toolchains)

- [x] debug 脚本复刻 CLI debug-start 模式（BITWARDENCLI_APPDATA_DIR 注入、NO_BUILD、bundle 不存在时报错提示）
- [x] 运行不触碰本机真实 `Bitwarden CLI` 数据目录
- [x] 提供 `node --inspect` 入口
- [x] `npm run debug:bwadmin -- --version` 跑通
