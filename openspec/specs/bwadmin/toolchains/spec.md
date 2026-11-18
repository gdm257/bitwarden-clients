# bwadmin/toolchains Specification

## Purpose

bwadmin 的开发者工具链：本地一键构建/隔离运行/断点调试，以及 CI 产出免 Node 安装的多平台单文件二进制。

## Requirements

### Requirement: 一键构建与统一命名

开发者 MUST 能通过根仓库的单条 npm script 构建 bwadmin，构建产物 MUST 命名为 `bwadmin.js`，不得与 `bw` CLI 的 bundle 名冲突。

#### Scenario: 构建 bwadmin

- **WHEN** 开发者在仓库根运行 bwadmin 构建 script
- **THEN** 构建成功且产物目录下存在 `bwadmin.js`，用 node 运行 `bwadmin.js --version` 能输出版本号

### Requirement: 隔离 profile 的调试运行

开发者 MUST 能通过单条 debug script 构建（可跳过）并运行 bwadmin；调试运行 MUST 使用仓库内隔离的数据目录，MUST NOT 读写本机真实 CLI 安装的数据；MUST 提供可被 IDE attach 的 inspector 入口。

#### Scenario: 首次调试运行

- **WHEN** 开发者运行 bwadmin debug script 并传入 `--version`
- **THEN** 系统先构建 bundle，再以隔离数据目录运行并输出版本号，本机真实 CLI 数据目录保持不变

#### Scenario: 跳过构建

- **WHEN** 开发者以跳过构建的环境变量运行 debug script 且 bundle 已存在
- **THEN** 系统直接运行现有 bundle，不触发构建

#### Scenario: bundle 缺失

- **WHEN** 开发者以跳过构建的环境变量运行 debug script 且 bundle 不存在
- **THEN** 系统报错并提示先执行一次完整构建

### Requirement: 多平台单文件打包

MUST 能将 bwadmin 打包为 win-x64、macos-x64、macos-arm64、linux-x64、linux-arm64 五个平台的单文件可执行，目标机器 MUST NOT 需要预装 Node；locales 等资源 MUST 完整打入。

#### Scenario: 打包并运行 win-x64

- **WHEN** 维护者运行 win-x64 打包 script
- **THEN** 产出独立的 `bwadmin.exe`，在无 Node 环境下运行 `--version` 输出版本号且 i18n 输出正常

### Requirement: CI 构建与发布

push 触及 bwadmin 相关路径或手动触发时，CI MUST 构建并打包五平台、对每个产物做 `--help` 冒烟验证并上传 artifacts；人工推送 `bwadmin-v*` tag 时 MUST 创建 GitHub Release 并附上各平台二进制，版本号从 tag 解析，MUST NOT 包含代码签名、Chocolatey 或 snap 步骤。

#### Scenario: push 构建

- **WHEN** push 的变更触及 bwadmin 目录
- **THEN** CI 产出五平台 artifacts，每个产物冒烟运行 `--help` 通过

#### Scenario: tag 发布

- **WHEN** 维护者推送形如 `bwadmin-v0.1.0` 的 tag
- **THEN** CI 创建 GitHub Release，版本号 `0.1.0`，附五平台二进制
