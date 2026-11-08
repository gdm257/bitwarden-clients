# Spec Delta

## Purpose

CLI 对组织的管理能力：成员、groups、collections、policies 与 org settings 的读写，使 org admin 无需打开 server 下发的 web vault。

## ADDED Requirements

### Requirement: 组织与成员只读查询

CLI MUST 提供 `list orgs` 与 `list members --orgid`，默认输出表格，`--raw`/`--json` 输出 JSON。

#### Scenario: 列出组织

- **WHEN** 用户执行 list orgs 且已 unlock
- **THEN** 输出所属组织的 id 与名称

#### Scenario: 列出成员

- **WHEN** 用户执行 list members --orgid <id>
- **THEN** 输出成员 email/status/role/id

### Requirement: 成员写操作

CLI MUST 支持 invite、reinvite、remove、revoke、restore（单个与 bulk）与 confirm（单个与 bulk）。confirm MUST 复用现有成员确认 crypto 流程，禁止新增加密逻辑。

#### Scenario: bulk confirm

- **WHEN** 用户对多个待确认成员执行 bulk confirm
- **THEN** 每个成员逐项成功或失败，结果逐项输出

#### Scenario: 撤销成员

- **WHEN** 用户 revoke 一个已确认成员
- **THEN** 成员被暂停访问，再次 restore 可恢复

### Requirement: Groups 管理

CLI MUST 支持 group 的 CRUD（含 bulk delete）及 group 成员的查看与设置。

#### Scenario: 创建 group

- **WHEN** 用户创建一个 group 并指定名称
- **THEN** group 出现在 list groups 输出中

### Requirement: Collections 权限管理

CLI MUST 支持 collection CRUD、group/user 访问权限分配、bulk access 更新与 bulk delete。

#### Scenario: 分配权限

- **WHEN** 用户为 group 分配某 collection 的访问权限
- **THEN** 该 group 的权限变更反映在 collection details 输出中

### Requirement: Policies 查看与更新

CLI MUST 支持列出组织全部 policies 及启用状态，并更新单个 policy 的启用与配置。

#### Scenario: 启用 policy

- **WHEN** 用户启用某个 policy
- **THEN** list policies 显示该 policy 为已启用

### Requirement: Org settings 查看与更新

CLI MUST 支持查看与更新组织设置。

#### Scenario: 查看设置

- **WHEN** 用户执行查看 org settings 命令
- **THEN** 输出组织当前设置
