# Spec Delta

## ADDED Requirements

### Requirement: CLI 身份声明

本 capability 所述命令属于 `bwadmin` CLI（`apps/bwadmin`），MUST NOT 被理解为 `bw` CLI（`@bitwarden/cli`）的命令。spec 文本中的 "CLI" 一律指 `bwadmin`。

#### Scenario: 读者识别工具

- **WHEN** 读者查看本 spec 中的任一命令
- **THEN** 可明确该命令通过 `bwadmin` 执行，而非 `bw`
