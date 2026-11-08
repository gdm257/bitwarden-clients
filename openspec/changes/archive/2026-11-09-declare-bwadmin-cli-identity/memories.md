# Memories

## Read sources

- `openspec/specs/cli-account-security/spec.md`
- `openspec/specs/cli-event-logs/spec.md`
- `openspec/specs/cli-org-admin/spec.md`
- `apps/bwadmin/project.json`
- `apps/cli/package.json`
- `openspec/changes/archive/2026-11-09-add-web-exclusive-cli/`

## Findings

- 三个主 spec（`cli-account-security` / `cli-event-logs` / `cli-org-admin`）通篇只写 "CLI"，未指明是哪个 CLI。
- 实现位于 `apps/bwadmin/`，project name 为 `bwadmin`，是独立新 CLI。
- 现有官方 CLI 为 `@bitwarden/cli`（`apps/cli`，二进制 `bw`），不包含这些 org admin / event logs / 2FA enroll 能力。
- 原 change（add-web-exclusive-cli）的 spec.md 嵌入的 `bw` help dump 仅作对照，主 spec 未声明 `bwadmin` 身份。

## Constraints

- 本 change 仅改 spec 文本，不涉及实现改动。
- 每个 capability 的 Purpose 变更需直接编辑主 spec；delta 只承载 requirement 级变更。
