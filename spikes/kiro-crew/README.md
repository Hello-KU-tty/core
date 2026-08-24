# Kiro/Crew capability probe

This directory is the bounded T01 probe for Vibe Helper. It is not application product code.

The probe validates:

- Crew App lifecycle and permission-scoped API access
- two app-owned Builder/Helper chat slots in one dashboard page
- redacted event counting without persisting raw session payloads
- MCP permission and Decision handoff across independent Agent sessions
- a no-tool Analyst dispatched through a hidden app-owned chat slot
- restart behavior and the Kiro IDE workspace-Agent fallback boundary

Never place account information, tokens, app secrets, user Kiro settings, or raw personal session logs in this directory.

## S4 synthetic Core/MCP probe

The isolated `s4-workspace` uses two project-local Kiro Agents and physically separate MCP tool catalogs:

- Builder: bounded context/Decision read and write tools
- Helper: bounded context/Decision read and freshness-check tools only
- deterministic controller: the only Decision resolution path in the probe

Run the transport/contract test:

```bash
cd mcp
pnpm install
pnpm run check
pnpm test
```

The generated synthetic state lives only under `s4-workspace/.probe-state/` and is ignored by Git.

## S5 hidden Analyst slot probe

The Crew UI creates a third temporary slot that is not rendered as another chat pane. A button submits one synthetic Episode to the no-tool `vibe-probe-analyst`, returns control to the UI, and polls only that app-owned slot until a schema- and correlation-validated proposal appears.

Crew 0.3.0's generic `useAppApi().post()` tries to JSON-decode the `/api/chat` SSE response. The probe therefore contains one fixed-path streaming adapter for `POST /api/chat`; all slot creation and result polling still use the permission-checked App API. This is intentionally not a generic HTTP client.

Build the installed UI artifact:

```bash
cd ui
pnpm install
pnpm run typecheck
pnpm run build
```
