# Leaf subagents

A directory here is compiled into a live tool on the root agent — creating one
IS wiring it. The `catalog` specialist is prepared but intentionally absent:
its prompt (`leafAgentPrompt("catalog")`), tool allowlist, approval set, and
skill bundle all exist in `agent/lib` and `@autumn/agent-docs`. To wire it,
mirror the `investigator` directory shape with `agent: "catalog"` and remove
the catalog policy block from the root `instructions.ts`.
