# account-registration Specification

## Purpose

`bwadmin` CLI 接收注册邮件中的 finish-signup 链接并完成账号注册，使被邀请人无需打开 server 下发的 web vault。

## Requirements

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

### Requirement: 发起注册

CLI MUST 支持 `register <email>`：按参数形态自动分流（URL 走既有收尾，email 走发起），向已配置的 self-hosted 服务器调用注册验证邮件端点，body 携带 email 与可选 `--name`。CLI MUST NOT 将请求发往官方云；服务器未配置或目标为官方云域名时 MUST 报错退出。

#### Scenario: email 参数发起

- **WHEN** 以 email 为参数运行 register 且服务器已配置
- **THEN** CLI 调用 send-verification-email 端点，携带该 email 与可选 name

#### Scenario: 服务器未配置

- **WHEN** 以 email 为参数运行 register 且未配置 self-hosted 服务器
- **THEN** CLI 报错提示先配置服务器，并以非零码退出

### Requirement: token 直返快速路径

当注册验证邮件端点在响应体中直接返回 token（服务器未启用邮件验证）时，CLI MUST 跳过所有交互，直接用该 token 完成 Registration Finish。

#### Scenario: 无邮件验证实例一步建号

- **WHEN** 端点响应携带 token
- **THEN** CLI 无交互完成注册并输出成功文案

### Requirement: 交互粘贴收尾

当端点返回邮件已发送（204）时，CLI MUST 提示用户粘贴邮件内容；接受完整 finish-signup URL 或裸 token。URL 携带 email 参数时 MUST 与发起邮箱一致，不一致 MUST 报错退出。非交互环境（禁用交互）下 MUST 报错而非挂起。收尾失败时 MUST 原样呈现服务端错误并以非零码退出，不做重试循环。

#### Scenario: 粘贴完整链接

- **WHEN** 用户粘贴 finish-signup URL 且 email 匹配
- **THEN** CLI 完成注册并输出成功文案

#### Scenario: 粘贴裸 token

- **WHEN** 用户粘贴裸 token
- **THEN** CLI 以发起邮箱完成注册

#### Scenario: 邮箱不匹配

- **WHEN** 粘贴的 URL email 参数与发起邮箱不一致
- **THEN** CLI 报错并以非零码退出

#### Scenario: token 失效

- **WHEN** 提交后服务端返回 token 无效或过期错误
- **THEN** CLI 原样呈现服务端报错并以非零码退出

### Requirement: 运行时文案插值

bwadmin 构建产物中的 i18n 文案 MUST 随源码 locales 同步构建，占位符（如生成密码、账号邮箱）MUST 在运行时正确插值显示。

#### Scenario: 生成密码可见

- **WHEN** 使用 `--generate` 成功注册
- **THEN** 成功输出显示插值后的初始密码而非占位符

