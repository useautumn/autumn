# Leaf subagents

A directory here is compiled into a live tool on the orchestrator (the
top-level `agent/`) — creating one IS wiring it. The `catalog` specialist is
prepared but intentionally absent: its prompt (`leafAgentPrompt("catalog")`),
tool allowlist, approval set, and skill bundle all exist in `agent/lib` and
`@autumn/agent-docs`. Catalog writes are exposed to no live agent — the
orchestrator only keeps catalog reads. To wire the specialist, mirror the
`investigator` directory shape with `agent: "catalog"` and reintroduce a
`catalog` routing rule (and the `catalog-decisions` part include) in
`content/instructions/orchestrator.md` in `@autumn/agent-docs`.

Shared config lives in `agent/lib`: model/reasoning (`model.ts`), sandbox
(`sandbox.ts`), disabled framework tools (`disabledTools.ts`), the Autumn
connection factory, per-agent tool allowlists, approval sets, and skills.
