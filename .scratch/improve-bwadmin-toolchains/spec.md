# improve-bwadmin-toolchains

Status: ready-for-agent

## Problem Statement

`bwadmin` 只有 Nx 构建定义：开发者每次要手敲 `npx nx build bwadmin` 再 `node dist/.../bw.js`，直接跑会污染本机真实的 `Bitwarden CLI` 数据目录，也没有现成的断点调试入口；同时没有任何 CI 打包，无法拿到免 Node 安装的单文件可执行版本。

## Solution

补齐 bwadmin 的两条工具链：

1. **本地开发**：一条 `debug:bwadmin` 命令完成构建（可跳过）+ 隔离 profile 运行 + `node --inspect` 调试入口，模式照抄 `apps/cli` 已验证的 debug-start 脚本。
2. **CI 打包**：`@yao-pkg/pkg` 把 bundle 打成五平台单文件（win-x64、macos-x64/arm64、linux-x64/arm64），新 workflow push 时出 artifacts，人工 tag `bwadmin-v*` 时出 GitHub Release。不做签名、Chocolatey、snap。

## User Stories

1. As a bwadmin 开发者, I want 一条命令 `npm run debug:bwadmin -- <args>` 就能构建并运行 bwadmin, so that 不用记住 nx 命令和 dist 路径。
2. As a bwadmin 开发者, I want 调试运行使用隔离的 `.debug/bwadmin-profile` 数据目录, so that 不会污染本机真实的 Bitwarden CLI 数据。
3. As a bwadmin 开发者, I want `NO_BUILD=1` 跳过重建, so that 迭代时启动更快。
4. As a bwadmin 开发者, I want `node --inspect` 调试入口, so that 能在 IDE 里打断点。
5. As a bwadmin 开发者, I want watch 模式下 bundle 自动重建, so that 改代码后只需重跑命令。
6. As a bwadmin 开发者, I want bundle 输出名为 `bwadmin.js`, so that 不会与 bw 的 `bw.js` 混淆。
7. As a bwadmin 使用者, I want 官方仓库 Release 页能下载五平台单文件二进制, so that 目标机器无需安装 Node。
8. As a bwadmin 使用者, I want push 到 bwadmin 相关路径后 CI 产出各平台 artifacts, so that 随时取用最新构建验证。
9. As a bwadmin 维护者, I want 人工推 `bwadmin-v*` tag 触发 GitHub Release, so that 版本发布节奏自己掌控。
10. As a bwadmin 维护者, I want 版本号从 tag 名解析, so that 与上游客户端的 2026.x.y 版本号脱钩。
11. As a bwadmin 维护者, I want CI 与本地共用同一构建命令, so that 不会出现本地能跑 CI 跑不了的漂移。
12. As a bwadmin 开发者, I want locales 等资源被完整打进单文件二进制, so that exe 在任何机器上输出正常。

## Implementation Decisions

- 新建 `apps/bwadmin/package.json`（workspace 名 `bwadmin`），承载 `bin`、`pkg.assets`、debug 与打包 scripts；Nx `project.json` 仍是唯一定义构建的地方。
- debug 脚本复刻 CLI 的 debug-start 模式：环境变量注入隔离 appdata 目录，构建默认走 Nx（oss-dev configuration）。
- 不做 desktop shared unlock 联调（明确 out of scope）。
- 打包工具用 `@yao-pkg/pkg`（仓库现有 devDependency），scripts 结构对齐 `apps/cli` 的 `package:*`；pkg 从仓库根解析 node_modules 中的 external 依赖。
- 新建独立 workflow 触发条件：push 路径过滤 `apps/bwadmin/**` + `workflow_dispatch` + tag `bwadmin-v*`；不复制 CLI 的签名、Chocolatey、snap 步骤。
- 根 package.json 只加转发 script（`debug:bwadmin`、`build:bwadmin` 等）。
- webpack 输出文件名改为 `bwadmin.js`（一处 output 配置）。

## Testing Decisions

- 最高 seam 是「产物可执行」：本地验证 = debug 脚本跑通 `bwadmin --version` 与一个只读命令；打包验证 = 打出的 win-x64 exe 跑 `--version`。
- CI 验证对齐 build-cli.yml 的做法：构建后在干净目录运行 `bwadmin --help` 冒烟。
- 不新增单元测试：本 change 全是构建/脚本配置，无常驻代码分支；debug-start 脚本若引入可测逻辑则沿用仓库 jest 惯例。

## Out of Scope

- bwadmin 命令行为变更（4 个既有 specs 的领域契约不动）。
- 代码签名、公证、Chocolatey、snap 分发。
- desktop shared unlock 联调。
- 自动打 tag / 自动版本号 bump。

## Further Notes

- 共识来源：本会话 grilling 全程（两轮问答均已确认）。
- 事实依据：CLI CI 用 `@yao-pkg/pkg` 6.5.1 + 手动 pkg-fetch base 二进制；本仓库 tags 均人工创建，无 CI 建 Release 先例，需自写。
