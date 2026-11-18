# Spec Delta

## Purpose

`bwadmin` CLI 接收注册邮件中的 finish-signup 链接并完成账号注册，使被邀请人无需打开 server 下发的 web vault。

## ADDED Requirements

### Requirement: 链接注册

CLI MUST 提供 `register <url>` 命令：从 finish-signup 链接的 query 参数解析 email 与 token，prelogin 获取 KDF 参数并派生 master key，调用服务端注册完成端点建号。CLI MUST 复用既有注册 crypto 管线，禁止新增加密逻辑。

#### Scenario: 交互式注册成功

- **WHEN** 用户粘贴合法 finish-signup 链接并交互式输入两次一致的 master password
- **THEN** 账号创建成功，输出账号 email 与下一步（confirm）提示

#### Scenario: 链接不合法

- **WHEN** 链接缺少 token、缺少 email 或不是 finish-signup URL
- **THEN** 命令报清晰错误退出，不发起任何注册请求

#### Scenario: 两次密码不一致

- **WHEN** 交互式输入的两次 master password 不一致
- **THEN** 提示重新输入，不发起注册请求

### Requirement: 非交互密码模式

CLI MUST 支持非交互模式：`--password` 使用指定初始密码，`--generate` 随机生成初始密码并在成功输出中一次性打印，同时提示让用户首次登录后修改。两种模式同时给出时 MUST 报参数冲突。

#### Scenario: 指定初始密码

- **WHEN** 用户以 `--password` 运行 register
- **THEN** 全程无交互提示，账号以该密码创建

#### Scenario: 随机生成初始密码

- **WHEN** 用户以 `--generate` 运行 register
- **THEN** 账号以随机初始密码创建，密码仅在成功输出中打印一次，并附带首登改密提示

#### Scenario: 参数冲突

- **WHEN** `--password` 与 `--generate` 同时给出
- **THEN** 命令报参数冲突错误退出

### Requirement: 引导流程文档

CLI 帮助与文档 MUST 说明成员引导三步流程（invite → register → confirm），包括 vaultwarden 上注册时邀请自动消耗、成员自动 Accepted 的行为，以及非交互模式下初始密码转交的零知识取舍。

#### Scenario: 查看帮助

- **WHEN** 用户查看 register 命令帮助
- **THEN** 输出覆盖链接格式、三种密码模式与三步流程说明
