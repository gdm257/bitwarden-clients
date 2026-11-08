# Spec Delta

## Purpose

CLI 查询 Vaultwarden 实例上的组织审计事件：org 级、成员级与 cipher 级 event logs。

## ADDED Requirements

### Requirement: 组织事件查询

CLI MUST 支持查询 org 级 event logs，带 start/end 时间过滤与 continuation 分页。

#### Scenario: 按时间过滤

- **WHEN** 用户指定 start/end 查询 org 事件
- **THEN** 仅返回时间范围内的事件，输出含类型、时间、acting user

#### Scenario: 分页

- **WHEN** 结果带 continuation token
- **THEN** 用户可用该 token 获取下一页

### Requirement: 成员与 cipher 事件查询

CLI MUST 支持查询单个成员与单个 cipher 的事件。

#### Scenario: 查询单成员事件

- **WHEN** 用户执行 member 事件查询并指定成员 id
- **THEN** 仅返回该成员的事件
