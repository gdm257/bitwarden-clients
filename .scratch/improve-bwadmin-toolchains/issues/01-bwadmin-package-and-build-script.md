# 01: bwadmin workspace package 与构建命令统一

**What to build:** 开发者能用 `npm run build:bwadmin`（根转发到 workspace script，内部走 Nx）构建 bwadmin，产物为 `bwadmin.js`（不再叫 `bw.js`），后续工具链脚本都有 package.json 这个落点可用。

**Blocked by:** None (can start immediately)

**Status:** resolved (commit 66bc24c79a on improve-bwadmin-toolchains)

- [x] 新建 `apps/bwadmin/package.json`（name `bwadmin`），含 build 转发 scripts
- [x] webpack 输出文件名改为 `bwadmin.js`
- [x] 根 package.json 加 `build:bwadmin` 转发 script
- [x] 构建产物存在且 `node <oss-dev>/bwadmin.js --version` 正常输出
