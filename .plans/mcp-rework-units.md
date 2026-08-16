# MCP rework — small units

Each unit is one PR-sized change: one behavior, tests, nothing else.
Leaf keeps serving production `/mcp` until a later cutover unit.

## Why mcp-use (not “the only MCP package”)

| Option | Role | Use it? |
|---|---|---|
| `@modelcontextprotocol/server` (official SDK v2) | Protocol core | mcp-use already sits on this |
| **mcp-use v2** | Host: tools, HTTP, Better Auth adapter, skills, inspector | **Yes — this rewrite’s host** |
| FastMCP-ts (Prefect) | Same idea, thinner, no Better Auth helper | Fine alternative; we’d hand-roll auth |
| `@mastra/mcp` | Agent runtime that also hosts MCP | No — that’s the knot we’re leaving |
| Official SDK alone | Most conservative | Fallback if mcp-use fights the monorepo |

mcp-use is the best *fit for Autumn* (Better Auth + Skills-over-MCP + inspector), not the uniquely best MCP library on earth. Unit 1 exists to prove it installs and serves HTTP in this repo. If it doesn’t, stop and switch the host to official SDK v2 — same folder, same later units.

## Units

1. **Host shell** — `apps/mcp` with mcp-use v2, `ping` only, smoke test. No auth, no Autumn tools, no Leaf cutover.
2. **Local run** — `bun run mcp`, port `3100`, listed in `scripts/dev.ts` *beside* Leaf (do not steal `:3099/mcp` yet).
3. **Auth at the door** — Better Auth JWT + `aud` check; secret-key fallback. Still no product tools.
4. **Read tools** — port list/get customer, plan, feature, org, logs from `@autumn/mcp`.
5. **Preview ticket** — `previewAttach` returns a short-lived ticket; `attach` refuses without it. One pair only.
6. **Other preview/write pairs** — subscription, schedule, balance, catalog. Same ticket rule.
7. **Resources + instructions** — agent-docs, same URIs as today.
8. **Skills-over-MCP** — serve `autumn-billing` etc. on the same connection.
9. **Eve points at the new host** — Leaf chat stays; MCP client URL changes. Approvals still park the write tool.
10. **Public cutover** — `mcp.useautumn.com` → `apps/mcp`. Remove Leaf `/mcp` and the API proxy (or alias only).
11. **Batch apply** — optional `previewChanges` / `applyChanges` for several writes, one Allow.
12. **Protocol pause** — fold preview+apply into one tool via `input_required` when Claude/Cursor speak 2026-07-28.

This PR is **unit 1 only**.
