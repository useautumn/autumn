# Autumn MCP Rework — Research Brief

> Status: research only. No implementation. Written against the repo as of
> `dev` (HEAD `4e550f77b`) plus current MCP / Better Auth / mcp-use docs
> (August 2026).
>
> Scope: (1) split MCP out of Leaf, (2) tool/server design including code
> mode + mcp-use v2 + Manufact, (3) MCP auth vs Better Auth.

---

## Bottom line

| Question | Recommendation | Difficulty |
|---|---|---|
| Split MCP out of Leaf? | **Yes — extract the hosted runtime, keep `@autumn/mcp` as a library.** Do not do this first. Evals do not require the bundle. | Medium, mechanical |
| Code mode as the public MCP design? | **No.** Code mode is a *client* pattern. Cursor / Claude / Codex will not use Autumn's executor. 32 tools / ~6k tokens is not the bottleneck. | n/a |
| mcp-use v2? | **Yes, if rewriting the server layer anyway.** Biggest wins: official SDK v2 / stateless HTTP, first-class Better Auth provider, Skills-over-MCP. Tool *logic* can port; the Mastra host layer is what you replace. | Medium rewrite |
| Manufact? | **Optional hosting DX for an extracted `apps/mcp`, not a prerequisite.** Custom domain + branch previews + inspector are real. You already have `mcp.useautumn.com`. Don't put Leaf/Slack on Manufact. | Easy once extracted |
| Auth? | **Better Auth already has the OAuth 2.1 / RFC 9728 / JWT-verify path. Most of the cooked-ness is Autumn wrappers.** Keep org+env consent and the scope model. Delete custom DCR, the dual token fork, and Leaf pass-through. | Medium-hard, mostly deletion + BA 1.7 |

**Suggested order:** auth cleanup → extract `apps/mcp` (can ride the Leaf rewrite) → mcp-use v2 + Skills-over-MCP → Manufact only if you want their hosting/inspector, not because you need it to ship.

The MCP should stay **agent-useful, not an OpenAPI mirror**. That part of the current design is already right. Don't throw it away in a framework swap.

---

## What we have today

```
External clients (Cursor / Claude / Codex)
        │  Streamable HTTP + OAuth or am_sk_*
        ▼
https://mcp.useautumn.com/mcp     (also proxied at api.useautumn.com/mcp)
        │
        ▼
@autumn/leaf :3099                Slack + web chat + MCP on the same process
        │
        ├── createAutumnOperationsMCPServer()   @autumn/mcp (Mastra MCPServer)
        │         32 tools + 6 resources + instructions from agent-docs
        │         tools call api.useautumn.com with the inbound Bearer
        │
        └── Eve (Leaf agent)
                  HTTP MCPClient → loopback localhost:3099/mcp
                  OAuth token minted into Leaf DB (not a real user OAuth flow)
```

**Auth server** already lives on the Autumn API (`@better-auth/oauth-provider` 1.6.25 at `/api/auth`). The MCP host is supposed to be a *resource server*. Today Leaf only checks the `am_oauth_` prefix and sets `principalId: "oauth:unverified"`. Real enforcement happens later, when a tool hits the API.

**Knowledge layer** is mid-migration into `@autumn/agent-docs`: one corpus → MCP resources + skills + Leaf prompts. Complementary, not competing. MCP = live capability. Skills = judgment.

---

## 1. Should MCP leave Leaf?

### What is actually bundled

Leaf is "Autumn's AI service": Slack bot, dashboard chat, *and* the hosted MCP routes (`apps/leaf/src/mcp/`). Same port, same deploy, same process.

`@autumn/mcp` is already a library. The jank is **hosting**, not the package boundary.

### The evals argument is weak

Both eval harnesses (`apps/leaf/tests/evals/`, `packages/mcp/tests/evals/`) already:

1. Spin up an ephemeral HTTP MCP server on a random port
2. Connect with `MCPClient` over HTTP
3. Mock the Autumn API via `fetch`

They do **not** call tools in-process. Co-location in the test runner is convenience, not a protocol requirement. An extracted `apps/mcp` (or a test helper that still imports `@autumn/mcp`) keeps this exact pattern.

What *does* help evals today is importing `packages/mcp/src/...` directly and injecting `req.auth`. That survives a split. It does not require Slack, Eve, or Leaf's Postgres.

### Real coupling (what actually breaks)

| Coupling | Why it exists | After a split |
|---|---|---|
| Eve → `CHAT_SERVER_URL/mcp` on loopback | Agent talks to "the MCP" as an HTTP client | Eve becomes a normal remote client of `mcp.useautumn.com` (or an internal URL) |
| `LOCAL_MCP_URL` used by org-context preload + approval preview | Same loopback assumption | Point at the MCP service |
| OAuth audiences registered for `mcp.` + `chat.` + `api.` `/mcp` | Same app, three public hosts | One canonical resource URL. This *simplifies* auth. |
| `chatProxyRouter` proxies `/mcp` from the API | Cloud agents (CMA) can't hit Leaf localhost | Keep a proxy *or* teach clients the canonical MCP host only |
| Leaf DB programmatic OAuth mint for Slack/web | Chat needs a Bearer without a browser | This is an auth-design problem, not a hosting problem |
| Approval UI (Slack blocks, dashboard cards) | Product surface around write tools | Stays in Leaf. MCP just exposes preview + write tools. |

### Recommendation

**Extract the hosted MCP runtime into `apps/mcp` (or equivalent). Keep `@autumn/mcp` as the library both the new app and evals import.**

Do it **alongside** the Leaf rewrite, not as a prerequisite and not as a follow-up that never happens. Reasons:

1. **Spec shape.** MCP 2026-07-28: the MCP host is an OAuth *resource server*; the authorization server is a separate entity. You already split those conceptually (API vs Leaf). The remaining bundle is Slack+MCP, which is an operational accident.
2. **Leaf rewrite is the cheap moment.** Eve already speaks HTTP MCP. After the rewrite it should be "just another client," not a special in-process sibling. If you keep serving `/mcp` from the new Leaf, you re-bake the same knot.
3. **OAuth gets easier with one resource URL.** Today `validAudiences` includes every host that happens to serve `/mcp`. One canonical `https://mcp.useautumn.com/mcp` is what RFC 8707 wants.
4. **Independent deploys / scale.** Chat and MCP have different traffic, auth, and failure modes. A Slack outage should not take down Cursor's Autumn MCP.
5. **Evals stay HTTP.** You lose nothing.

**Do not** move tool implementations into Leaf, and do not make Eve call tools via function imports. The HTTP boundary is the product.

**Do not** split first if auth is still pass-through. A second app that still sets `oauth:unverified` is the same mess on a new hostname.

### What to keep shared

- `@autumn/mcp` tool factories, schemas, analytics
- `@autumn/agent-docs` resources / instructions / skills
- Autumn API as the only place that mutates billing state
- Eval harness pattern (HTTP + mock API)

---

## 2. How to design the MCP

### Industry consensus (2026)

The teams that shipped real remote MCPs (GitHub, Stripe, Linear, Notion) converged on the same lessons:

1. **Do not 1:1 wrap the REST API.** GitHub shipped 100+ endpoint-shaped tools; agents loaded all of them; selection collapsed. They walked it back to *toolsets* (issues, repos, PRs) that match how people think about the product.
2. **Design for intent, not resources.** A good tool is "preview then attach this plan with these defaults," not `POST /v1/attach`. Push deterministic orchestration (preview pairing, invoice defaults, org agent-rules) into the server. Leave judgment in skills/resources.
3. **Keep the always-loaded tool surface small.** Anthropic tool-search: 77k → 8.7k tokens (85%). Cloudflare/Anthropic code execution: ~98.7%. These matter at 50+ tools or multi-server setups. Autumn is at **32 tools / ~23.8k chars / ~6k tokens** (`measureMcpTools.ts`). That is fine.
4. **MCP + Skills are complementary.** MCP = authenticated capability. Skills / resources = playbooks. This is already the agent-docs plan.
5. **Remote + OAuth is the default.** Stdio is for local disk. Hosted Streamable HTTP + OAuth (with secret-key fallback for CI) is what Stripe/GitHub/Vercel ship. You already do this.
6. **2026-07-28 is stateless.** No `initialize` session, no sticky `Mcp-Session-Id`. Any replica can serve any request. This is the hosting reason to leave Mastra's older session assumptions if you rewrite.

### What agents actually do with Autumn

From `packages/agent-docs` skills + MCP instructions:

| Workflow | Knowledge | Tools today | Notes |
|---|---|---|---|
| Model pricing | `autumn-catalog` + concepts | `previewUpdateCatalog` / `updateCatalog` | Repo agents use `atmn`; chat agents use MCP |
| Bill customers | `autumn-billing` | attach / updateSubscription / createSchedule + previews | Strict checklist; `getAgentRules` first |
| Look up customers / plans | billing + tool copy | list/get customer, plan, feature, entity | Composition lives in descriptions |
| Grant credits | (thin) | `previewCreateBalance` / `createBalance` | No dedicated skill |
| Investigate incidents | `autumn-investigate` | `queryRequestLogs` → `searchRequestLogs` + `getCustomer` | Two-pass log grammar is agent-shaped |
| Org agent defaults | — | `getAgentRules` / `updateAgentRules` | Preloaded on Leaf |
| Integrate SDK / gate / billing UI | **atmn skills only** | none | Correctly *not* MCP |
| Onboard pricing in-dashboard | inline pricing-agent prompt | `build_pricing` | Separate engine, not MCP |

The current MCP is already **hybrid agent-oriented**: API schemas underneath, workflow prose + preview pairs + approval annotations + org rules on top. A thin OpenAPI wrapper would be a regression.

Gaps worth considering later (not blockers):

- `multi_attach`, `setup_payment`, customer portal — documented in investigate, not tools
- No `check` / `track` tools — those belong in the user's app (skills), not the operator MCP
- `plan-management` vs `catalog` resource URI drift
- Unused second toolset (`createAgentAutumnOperationTools` + Redis pending actions) — dead weight
- Three approval lists that don't match (`destructiveHint` vs Eve hardcoded names vs `APPROVAL_GATED_TOOL_NAMES`)

### Code mode — should we use it?

**Code mode / "code execution with MCP"** (Anthropic Nov 2025, Cloudflare "Code Mode"): the *client* presents MCP servers as a filesystem/SDK and the model writes code that calls tools in a sandbox. Benefits: progressive disclosure, filter huge results before they hit context, loops/conditionals without N round-trips, PII never entering the model.

mcp-use implements this on the **client** (`@mcp-use/client` `{ codeMode: true }` → `search_tools` + `execute_code`). It is not a server design. Cursor, Claude Desktop, Codex, and Claude Code have their own harnesses. They will keep calling `tools/call` on your 32 tools.

**Do not redesign the public Autumn MCP as code mode.** You would be building an executor nobody else's client uses, plus a sandbox you have to secure.

**Optional later, Leaf-only:** if Eve starts doing heavy investigation (filter 10k log rows, join customer + stripe timeline), a code-mode *client* in Leaf can sit in front of the same MCP. That is an Eve feature, not an MCP rewrite.

**What to do instead of code mode for the public server:**

1. Keep the tool count roughly where it is. Collapse only the obvious dups (`createPlan`/`updatePlan` vs catalog batch, `hasCustomers`).
2. Finish agent-docs so resources/skills carry judgment; tools stay verbs.
3. Adopt **Skills-over-MCP** (SEP-2640, shipping in mcp-use 2.1): serve `autumn-billing` etc. as `skill://…` resources on the same connection. This is the highest-leverage design change. External agents that can't `atmn init` finally get the playbooks.
4. If a client supports toolsets (GitHub-style), expose `catalog` / `billing` / `investigate` groups. Don't wait on it.
5. Keep preview-first writes and `destructiveHint`. Unify the three approval lists.

### mcp-use v2 — does it simplify implementation?

**Yes for the server/auth/hosting layer. No for the domain tools.**

What mcp-use v2 actually is:

- TypeScript server framework on the official MCP SDK v2 (2026-07-28 stateless HTTP)
- `server.tool({ name, schema }, handler)` + resources + prompts + MCP App views
- Built-in Inspector (`mcp-use dev`)
- OAuth providers, including **`oauthBetterAuthProvider`**
- Skills-over-MCP from a `skills/` folder
- Deploy path to Manufact (`mcp-use deploy`, monorepo `--root-dir` + `--watch-paths`)
- Split packages: `mcp-use` (server), `@mcp-use/client`, `@mcp-use/agent`, `@mcp-use/inspector`

What it replaces in Autumn:

| Today | With mcp-use |
|---|---|
| `@mastra/mcp` `MCPServer` + `startHTTP()` | `MCPServer` from `mcp-use` + `server.fetch` / `listen` |
| Hand-rolled PRM + WWW-Authenticate | Provider mounts discovery + verifies JWT + audience |
| Leaf `buildAuthForRequest` prefix check | `ctx.auth` with verified user/scopes |
| agent-docs merge into Mastra resources | Same content, plus native Skills-over-MCP |
| Axiom tool analytics | Keep Axiom *or* use Manufact traces |
| Mastra MCPClient in Eve / evals | Stay on Mastra client **or** switch evals to `@mcp-use/client` |

What it does **not** replace:

- Tool business logic (`callAutumn`, preview pairs, Zod from `@autumn/shared`)
- Consent UI (org + sandbox/live)
- Scope definitions
- Approval cards in Slack/dashboard
- Autumn API itself

**Migration shape:** keep `packages/mcp` as the domain library; swap the host from Mastra `MCPServer` to mcp-use `MCPServer`. Don't rewrite `customers.ts` / `billing.ts` from scratch. Do delete the unused agent toolset / Redis pending-actions path while you're there.

**Risks:**

- Mastra is also Eve's agent runtime. Decoupling MCP from Mastra is good; don't accidentally couple Eve to mcp-use's agent package.
- mcp-use v2 is young (rebuilt for 2026-07-28). Official SDK v2 still speaks older protocol when needed; clients negotiate down. Still a moving target vs Mastra, which you already run in prod.
- Manufact detector expects an mcp-use (or Dockerfile) app, not "the whole Autumn monorepo." You want `apps/mcp` with a small install surface.

**Verdict:** If Leaf is being rewritten and MCP is being extracted, **do not carry Mastra MCPServer into the new app**. mcp-use v2 is the better host: spec-current, Better Auth native, skills native. Treat it as a hosting/framework swap, not a product redesign.

### Manufact — does it simplify deploy?

Manufact Cloud is mcp-use's hosted path: GitHub auto-deploy, branch preview URLs, custom domains, logs, traces, client snippets, cross-client checks.

**Useful if** you extract `apps/mcp` and want:

- Preview MCP URLs per PR (`https://<slug>--br-<branch>.deploy.mcp-use.com/mcp`) for "does Cursor still OAuth?"
- Inspector / traces without more Axiom plumbing
- Someone else owning TLS + process supervision

**Not a simplification if** you keep MCP inside Leaf, or if you just want a Node process behind `mcp.useautumn.com` (you already have that).

**Constraints:**

- Canonical resource URL must remain `https://mcp.useautumn.com/mcp` (OAuth audience). Custom domains are supported; don't advertise the `*.run.mcp-use.com` URL as the product URL.
- MCP needs `AUTUMN_API_URL`, issuer, and env. That is a few secrets, not a data plane. Manufact does not need your Postgres if tokens are JWTs verified locally.
- Do not deploy Leaf/Slack/chat there.
- Monorepo: `--root-dir apps/mcp --watch-paths "apps/mcp/**" --watch-paths "packages/mcp/**" --watch-paths "packages/agent-docs/**"`.

**Verdict:** Framework first (mcp-use), hosting second. Manufact is a nice-to-have once `apps/mcp` exists. It is not how you fix auth or design.

---

## 3. Auth — what's cooked, and what Better Auth actually gives you

### Why it feels cooked

Better Auth is already the authorization server. Autumn then wraps the three load-bearing endpoints and invents a fourth credential system:

1. **Dual token model** in `handleOAuthTokenWithApiKey`: MCP clients get `am_oauth_*`-prefixed BA tokens; everyone else gets rotated `am_sk_*` API keys. Classification is client metadata *or* "did the token request include a `/mcp` resource URL?"
2. **Leaf does not verify tokens.** `buildAuthForRequest` sees `am_oauth_*` → `principalId: "oauth:unverified"` + hardcoded `DEFAULT_OAUTH_RESOURCE_SCOPES`. The MCP layer's view of auth is a lie. Enforcement is a later API call.
3. **RFC 8707 is inverted.** Clients send `resource` (spec: MUST). Autumn **strips it** before Better Auth sees it, then smuggles the resource back as `x-autumn-oauth-resource` on API calls.
4. **Custom DCR** replaces BA's `allowDynamicClientRegistration: true`. Heuristic classification (`"cursor"` in the name…), reserved IDs, in-memory 5-minute cache (not multi-pod safe).
5. **Chat/Slack mint OAuth rows directly** (`replaceInstallationOAuthCredentials`). Reuses OAuth tables, skips the protocol. Empty scopes + fail-open = "unrestricted chat."
6. **~10 auth paths** share those tables (dashboard session, secret key, publishable key, customer JWT, public MCP, Slack MCP, internal MCP, atmn CLI, Summer eval, programmatic chat).
7. **atmn legacy CRUDL self-heal** (`ensureAtmnAuthorizeScopes`) is a landmine next to MCP work.
8. Dead code: `getMcpOAuthScopeGrant` / `assertMcpOAuthScopeGrant` unused; `is_internal_mcp` fetched in Consent and ignored.

This is not "Better Auth can't do MCP." This is "we outgrew the first integration and kept every compatibility shim."

### What the spec requires (2026-07-28)

A protected MCP server is an **OAuth 2.1 resource server**. It must:

- Serve RFC 9728 protected-resource metadata
- 401 + `WWW-Authenticate: Bearer resource_metadata="…"`
- Validate that the access token was issued **for this resource** (`aud` = canonical MCP URI)
- Not invent a parallel session model

Clients must send RFC 8707 `resource` on authorize *and* token requests. DCR is now deprecated in favor of Client ID Metadata Documents (CIMD); DCR still works and every current editor still uses it. PKCE S256 is mandatory.

**Token passthrough is explicitly a bad idea** in current MCP security guidance: the resource server should verify the token, then call downstream APIs with *its own* credentials or a clearly bound token. Autumn's "forward the user's `am_oauth_*` to the API" is the common pragmatic pattern (Stripe does something similar: MCP is a credential-passing layer, API enforces). That is OK **if** the MCP edge verifies the token first and the API still checks audience + scopes. Today only the second half is true.

### What Better Auth has out of the box (now)

You are on **Better Auth 1.6.25** with `oauthProvider()` + `jwt()`. That is the right plugin family.

As of BA **1.7** (shipping / beta in 2026):

| Capability | Where | You have it? |
|---|---|---|
| OAuth 2.1 AS: authorize, PKCE, token, refresh, consent storage | `@better-auth/oauth-provider` | **Yes** |
| JWT access tokens + JWKS | `jwt()` plugin | **Yes** (plugin on; MCP path still uses opaque `am_oauth_*`) |
| RFC 8414 AS metadata | BA | **Yes**, plus 4 extra paths for client bugs |
| RFC 9728 PRM | BA `mcp()` / oauth-provider resource config | **Partial** — you hand-roll Leaf + API documents |
| Resource-bound tokens (`resource` → `aud`) | BA 1.7 `mcp({ resource })` / oauth-provider `resources` | **Configured `validAudiences`, then you strip `resource`** |
| DCR | `allowDynamicClientRegistration: true` | **Enabled, then fully overridden** |
| `requireMcpAuth` / `createMcpResourceClient` | `@better-auth/mcp` (1.7) or 1.6 `withMcpAuth` / `createMcpAuthClient` | **Not used.** Leaf pass-through instead |
| Hono / official-SDK / **mcp-use adapters** | `better-auth/plugins/mcp/client/adapters` (`mcpAuthHono`, `mcpAuthMcpUse`) | **Not used** |
| mcp-use `oauthBetterAuthProvider({ authURL, resource })` | `mcp-use/oauth/better-auth` | **Not used** — this is the drop-in you want |

The 1.6 docs already describe the *remote MCP* pattern: MCP is a different process; `createMcpAuthClient({ authURL })` verifies the Bearer against Better Auth, mounts discovery, and gives you `session.userId / scopes / clientId`. mcp-use's Better Auth provider does the same and also checks **resource audience**.

**So: yes, Better Auth has an out-of-the-box MCP resource-server path.** You built a custom one instead, then punched holes in it for chat and atmn.

### What you still have to build (this is the real Autumn-shaped work)

Better Auth will not know about:

1. **Organization picker + sandbox/live** on the consent screen. Keep `Consent.tsx` + `handleOAuthConsentWithEnv`. This is product, not a missing library feature.
2. **Autumn scopes** (`customers:read`, `billing:write`, …) and role→scope mapping. You already pass these into `oauthProvider({ scopes })`. Keep them. Teach the MCP edge to *read* granted scopes from the verified token instead of stuffing defaults.
3. **Secret-key fallback** (`Authorization: Bearer am_sk_*`) for CI / Claude Managed Agents / scripts. Keep it. It is one branch in the resource-server middleware, not a second OAuth protocol.
4. **A first-class story for Leaf/Slack acting as a client.** Stop inserting token rows. Options, in order of cleanliness:
   - **Authorization-code** with a confidential Leaf client, user-linked, refresh in Leaf DB (real OAuth, you already have most of the tables)
   - **Client credentials** (or BA equivalent) for the bot, plus user identity as a separate claim if needed
   - Last resort: keep programmatic mint but isolate it (`kind: chat_provisioned`) and **never** share the public DCR / consent / token wrappers
5. **atmn CLI.** Isolate behind its own client + legacy scope map. Do not let MCP auth refactors touch `ensureAtmnAuthorizeScopes` in the same PR.

That is not a large new auth product. It is "use BA as the AS, use BA/mcp-use as the RS verifier, keep three Autumn-specific policy surfaces."

### Target architecture

```
Cursor / Claude / Codex          Leaf / Eve
        │                              │
        │  OAuth code + PKCE           │  confidential client
        │  resource=https://mcp.useautumn.com/mcp
        ▼                              ▼
┌─────────────────────────────────────────────┐
│  Autumn API  /api/auth                      │
│  Better Auth oauthProvider + jwt            │
│  DCR (BA native) · consent (org+env UI)     │
│  issues JWT (or opaque) with aud=MCP URL    │
└─────────────────────────────────────────────┘
                    │
                    │ Bearer JWT
                    ▼
┌─────────────────────────────────────────────┐
│  apps/mcp   https://mcp.useautumn.com/mcp   │
│  mcp-use + oauthBetterAuthProvider          │
│  verify iss / sig / exp / aud / scopes      │
│  secret-key branch for am_sk_*              │
│  tools → Autumn API with verified identity  │
└─────────────────────────────────────────────┘
```

Delete or shrink:

- `registerMcpOAuthClient` heuristics (or keep a thin allowlist of redirect URI rules on top of BA DCR)
- `handleOAuthTokenWithApiKey` MCP vs API-key fork for MCP clients
- Stripping `resource`
- Leaf `oauth:unverified`
- In-memory DCR cache
- Four extra well-known routes once clients are re-tested on BA defaults
- Unused scope-grant helpers
- Redis refresh-replay if BA 1.7 `refreshTokenReuseInterval` covers the Cursor/Claude retry storm

### BA 1.7 upgrade

Worth doing as part of this, not as a drive-by:

- `@better-auth/mcp` is now a separate package on top of oauth-provider
- Schema: `oauthApplication` → `oauthClient` (not auto-copied)
- `requireMcpAuth` passes JWT claims, not a session row
- OAuth endpoints stay under `/oauth2/*` (you already live there)
- 1.7 oauth-provider aligns MCP with 2026-07-28 (`applicationType`, stricter redirects)

This is a **real migration**. Do it as its own sequenced step with the existing OAuth integration tests (`mcp-oauth-refresh-scopes`, `registerMcpOAuthClient`, Leaf `oauth.test.ts`, atmn tests). Do not mix it with a tool-surface redesign.

### How much work is "doing auth properly"?

| Work | Size | Notes |
|---|---|---|
| MCP edge verifies JWT + `aud` (mcp-use provider or `createMcpAuthClient`) | Small | Deletes more than it adds |
| Stop stripping `resource`; bind tokens to `https://mcp.useautumn.com/mcp` | Small–medium | Needs client re-test (Cursor/Claude/Codex) |
| Retire custom DCR or shrink to URI policy | Medium | Watch reserved client IDs |
| One token model for MCP (JWT, no `am_oauth_` prefix fork) | Medium | Biggest behavioral change for existing connected editors — they will re-auth |
| Consent org+env stays | Already done | Don't rewrite |
| Chat/Slack credentials become a real client | Medium | This is the scary one; isolate from public MCP |
| BA 1.7 schema migration | Medium | Dedicated PR, existing tests |
| atmn isolation | Small if you don't touch it | Large if you do |

**You do not need to build an authorization server.** You already have one. You need to stop fighting it.

---

## 4. Recommended shape of the rework

Three layers, three different rates of change:

```
┌─────────────────────────────────────────────┐
│  agent-docs     knowledge (skills/resources)│  already in progress
├─────────────────────────────────────────────┤
│  @autumn/mcp    domain tools (preview/write)│  keep; trim dead toolset
├─────────────────────────────────────────────┤
│  apps/mcp       host + auth + deploy        │  new; mcp-use + BA verify
└─────────────────────────────────────────────┘
         ▲
         │ HTTP MCP (same protocol)
    Leaf / Eve / Cursor / Claude / evals
```

### Phase A — Auth (do this regardless of Leaf)

1. Pick one canonical resource: `https://mcp.useautumn.com/mcp`.
2. Verify tokens at the MCP edge (even while still hosted in Leaf).
3. Stop stripping `resource`; put it on the token `aud`.
4. Keep consent org+env and secret-key fallback.
5. Plan BA 1.7 + chat-credential isolation as follow-ups, not the same PR.

This is the highest-leverage fix and unblocks a later split.

### Phase B — Extract host (ride the Leaf rewrite)

1. `apps/mcp` serves `/mcp` + PRM only.
2. Leaf/Eve become a client of that URL.
3. Evals import `@autumn/mcp` / hit a test server the same way they do now.
4. Drop `api.useautumn.com/mcp` proxy once clients are on the canonical host (or keep it as a compatibility alias with the *same* resource URL advertised — aliases that change `resource` will break OAuth).

### Phase C — mcp-use v2 + Skills-over-MCP

1. Swap Mastra `MCPServer` for mcp-use.
2. `oauthBetterAuthProvider({ authURL, resource })`.
3. Serve agent-docs skills via Skills-over-MCP (this is the product upgrade).
4. Inspector for local + PR preview.
5. Delete unused agent toolset / Redis pending actions / `confirmBillingAction` ghost.

### Phase D — Manufact (optional)

Custom domain `mcp.useautumn.com`, watch-paths on `apps/mcp` + `packages/mcp` + `packages/agent-docs`. Only after C is boring.

### Phase E — Tool surface (ongoing, not a rewrite)

- Unify approval lists
- Retire `hasCustomers` / prefer catalog over plan CRUD
- Add tools only when a skill workflow is blocked (not when an API route exists)
- Resource URI cleanup (`plan-management` → `catalog`)
- Code mode only if Eve needs it

---

## 5. Difficulty vs the Leaf rewrite

The Leaf rewrite and the MCP rework **touch at the HTTP client boundary and at chat OAuth minting**. They should not share a branch.

| If Leaf rewrite… | MCP should… |
|---|---|
| Changes how Eve is hosted / prompted | Keep Eve as an MCP *client*. Don't re-embed tools. |
| Changes Slack/web approval UX | MCP keeps preview+write tools; Leaf owns cards. |
| Changes chat credential storage | Coordinate with Phase A/B auth. This is the one shared landmine. |
| Wants in-process tool calls "for speed" | Refuse. You will re-create today's knot and kill eval parity with external clients. |

Evals calling MCP over HTTP is a **feature**. It is how you know Cursor will see the same server Eve sees.

---

## 6. What I would not do

- Wrap the entire public API as MCP tools
- Make code mode the public interface
- Put Slack and MCP in the same new Leaf
- Build a second auth system (WorkOS, Auth0) — you already own BA and the consent UI
- Deploy the monorepo root to Manufact
- Rewrite tool handlers while swapping frameworks
- Touch atmn OAuth in the same change as MCP auth
- Keep `createAgentAutumnOperationTools` "in case"

---

## Key references (in-repo)

- Host: `apps/leaf/src/mcp/`, `packages/mcp/src/server/server.ts`
- Auth: `server/src/utils/auth.ts`, `server/src/internal/auth/oauth/`, `apps/leaf/src/mcp/auth/resolveRequestAuth.ts`, `packages/auth/src/oauth/`
- Knowledge: `packages/agent-docs/`, `.plans/agent-experience-revamp.md`
- Evals: `apps/leaf/tests/evals/`, `packages/mcp/tests/evals/`
- Public docs: `apps/docs/mintlify/documentation/mcp.mdx` (still mentions `autumn://docs/plan-management`)

## Key references (external, Aug 2026)

- [MCP authorization 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Better Auth MCP plugin](https://www.better-auth.com/docs/plugins/mcp) and [1.7 upgrade](https://www.better-auth.com/docs/guides/1-7-upgrade-guide)
- [mcp-use v2](https://manufact.com/blog/mcp-use-v2), [Better Auth provider](https://docs.mcp-use.com/typescript/server/authentication/providers/better-auth), [Skills-over-MCP](https://manufact.com/blog/skills-over-mcp), [Code mode (client)](https://docs.mcp-use.com/typescript/client/code-mode)
- [GitHub MCP launch lessons](https://www.arcade.dev/blog/enterprise-mcp-lessons-from-githubs-mcp-server-launch/)
