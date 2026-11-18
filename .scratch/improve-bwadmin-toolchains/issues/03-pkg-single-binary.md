# 03: @yao-pkg/pkg 五平台单文件打包

**What to build:** 本地运行 `npm run package:bwadmin:win|mac|mac-arm64|lin|lin-arm64` 产出免 Node 的单文件可执行（win 为 `bwadmin.exe`），locales 资源完整打入。

**Blocked by:** 01

**Status:** resolved (commit 4adf69e392 on improve-bwadmin-toolchains)

- [x] package.json 配置 `bin` 与 `pkg.assets`（覆盖 bundle 与 locales）
- [x] 五个 `package:bwadmin:*` scripts，结构对齐 apps/cli 的 `package:*`
- [x] pkg 从仓库根解析 node_modules externals
- [x] 本机打 win-x64 并运行 `bwadmin.exe --version` 验证
