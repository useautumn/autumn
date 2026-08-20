# Leaf subagents

A directory here is compiled into a live tool on the orchestrator (the
top-level `agent/`) — creating one IS wiring it. The `catalog` specialist is
prepared but intentionally absent: its prompt (`leafAgentPrompt("catalog")`),
tool allowlist, approval set, and skill bundle all exist in `agent/lib` and
`@autumn/agent-docs`. To wire it, mirror the `investigator` directory shape
with `agent: "catalog"`, move the catalog tools out of the orchestrator's
allowlist and approval set, and drop the `catalog-decisions` part include from
`content/instructions/orchestrator.md` in `@autumn/agent-docs`.

Shared config lives in `agent/lib`: model/reasoning (`model.ts`), sandbox
(`sandbox.ts`), disabled framework tools (`disabledTools.ts`), the Autumn
connection factory, per-agent tool allowlists, approval sets, and skills.
