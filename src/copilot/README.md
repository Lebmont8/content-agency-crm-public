# Copilot

Generates strict sales decisions, reply drafts and PPV proposals for the
AI-model accounts this CRM runs.

## Context

Every account here is a **disclosed AI model** — fans know they are chatting
with an AI. That removes the deception concern, so the copilot supports two
modes:

- **Assist** — a chatter clicks "suggest", reviews the draft, edits, and sends.
- **Auto** — the account has `aiAutoReply` on; the system replies to incoming
  messages automatically while a chatter supervises and can toggle it off to
  take over.

Anything the copilot produces (message or PPV) is stored with `aiGenerated =
true`. When a fan buys an AI-generated PPV, the resulting transaction is
`aiAttributed = true` — that is what the **14-day AI commission** is computed
on (`src/domain/commission.ts`).

## Provider

`getCopilot()` remains the deterministic `MockCopilot` used by mock lifecycle
tests. Real traffic uses explicitly gated OpenAI SHADOW/LIVE providers.

The model settings page has a separate OpenAI PREVIEW provider. It receives the
saved draft for exactly one creator account and a bounded local test history.
Its protected developer instructions are structurally separated from owner
configuration and simulated client text. Preview uses `store: false`, reserves
an atomic daily run/cost budget, and returns reply text plus safe provider trace
metadata. It has no action, message, publish or outbox capability.

Durable inbound processing calls `decide()` and validates the result through
`CopilotDecisionSchema`. The orchestrator stores state changes and proposed
`AgentAction` rows, then passes typed actions through the sales policy/tool
boundary. Allowed actions are queued through the durable outbox; denied actions
retain an explicit reason code and create no delivery.

## Boundaries

- Auto-send only happens on real connectors that permit bots (e.g. Telegram's
  official Bot API). Mock inbound exercises the same policy/outbox path without
  adding live platform writes. For OnlyFans/Fansly the connector is an
  external module and their automation rules are that module's concern — this
  codebase does not implement platform access for them.
- Mass broadcast / trigger automations remain a separate future module.
- Enabling `OPENAI_PREVIEW_ENABLED` does not enable SHADOW/LIVE or platform
  writes. A draft affects real conversations only after explicit publication.
