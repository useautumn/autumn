# Leaf Evals

Braintrust evals for Leaf and Autumn MCP behavior.

## Run

```sh
bun -F @autumn/leaf eval:mcp
```

Eval files set `noSendLogs` when `BRAINTRUST_API_KEY` is absent, but agent
model calls still need the normal model provider environment.

## Pattern

- Build setup state with `fixtures/*` builders.
- Create runtime state with `context/createEvalContext`.
- Use a driver factory, usually `createGenericMcpAgentDriver`, to exercise the runtime.
- Assert behavior with deterministic scorers before adding LLM judges.
- Keep real customer/org names out of fixtures; use setup tags like
  `invoice-mode-customer-missing-email`.
- Keep `trace.event(...)` terminal-only. Braintrust spans should come from the
  Mastra observability exporter unless a test explicitly needs custom spans.

## Context

The eval context is intentionally split by responsibility:

- `harness/context` owns the mock Autumn API and local MCP server.
- `harness/configs` owns defaults and reusable eval configuration objects.
- `harness/drivers` owns agent/client variants that talk to the MCP server.
- `harness/tracing` owns local terminal visibility for user turns, tool calls,
  API calls, and approvals.

Eval files should read like scenarios: choose a fixture setup, create a context,
run conversation turns, return scorer output.

The old MCP evals under `packages/mcp/tests/evals` are intentionally left in
place while this structure is proven out.
