# 04: build-bwadmin CI workflow（artifacts + tag Release）

**What to build:** push 触及 `apps/bwadmin/**` 或手动触发时，CI 构建并打包五平台、每平台冒烟 `--help`、上传 artifacts；人工推 `bwadmin-v*` tag 时创建 GitHub Release 附各平台二进制，版本号从 tag 解析。

**Blocked by:** 03

**Status:** resolved (commit b86f1d006e on improve-bwadmin-toolchains)

- [x] workflow：push 路径过滤 + workflow_dispatch + tag `bwadmin-v*`
- [x] 五平台 matrix 打包并上传 artifacts
- [x] 打包后冒烟运行 `bwadmin --help`（对齐 build-cli.yml 做法）
- [x] tag 触发时出 GitHub Release，Release 名用 tag 解析出的版本号
- [x] 不含签名 / Chocolatey / snap 步骤
