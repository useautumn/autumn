# Slack Per-User Permissions — Implementation Brief

> **Audience: the AI agent implementing this.** This is a design + handoff doc, not
> finished code. Read it top to bottom before touching anything. Everything below
> references real functions in this repo with `path:line` so you can jump straight
> to the source. The branch this lands on is `feat/match-slack-scopes`.

---

## 1. Purpose — what we're actually building

Today the Slack bot (the `leaf` app) acts with **one shared OAuth token per workspace**,
minted at install time and tied to whoever installed the app. Every Slack user who
pings the bot pulls that same token, so everyone has the installer's permissions.
There is no per-person authorization.

**Goal:** make the bot act as the *specific Slack user who sent the message*, with
*that user's* Autumn permissions, read live from the Autumn DB.

Concretely:

- The scope of any bot action is determined by **who sent the fucking message**.
- Permissions are **restricted to that user** — not the installer, not the org default.
- **Write actions and approvals** (e.g. attaching a plan) are scoped to the user who
  clicks/executes them.
- **Phase 1:** identify users by reading the Slack user's email with the bot token
  (`users:read.email`) and matching it 1:1 against Autumn `user.email`.
- **Later phase:** TBD

### The mental model (read this twice)

The AI agent is **not** the authorization boundary. We do **not** ask the LLM "is this
user allowed?" — that's jailbreakable. Authorization lives *below* the model:

1. We resolve the Slack user → their Autumn user → their role → their scopes.
2. We mint a **per-user token bounded to those scopes**.
3. The agent acts *through* that token. The Autumn server enforces the scopes on every
   MCP tool call (403 on anything out of scope).

So "handing permissions to the AI" really means: **mint the right token from the
resolved identity, and let the server enforce it.** Identity travels as a token, not as
a fact the agent reasons about. Tool-filtering and prompt hints (below) are optional UX
on top — they are *signage*, the token is the *lock*.

---

## 2. Phase 1 Flow (Slack event → scoped agent)

```
Slack message → BotMessage.providerUserId (= Slack event.user, a bare "Uxxxx")
   │
   ├─ runMessage() resolves the ORG from the workspace        (exists today)
   │     resolveSlackAdminOrgContext → { org, installation }
   │
   ├─ [NEW] resolve the AUTUMN USER from the Slack id via Slack email:
   │     Slack Web API users.info/users.list with users:read.email
   │       → profile.email for Slack event.user
   │     user WHERE lower(email)=lower(<slack email>) → userId
   │     getScopesForUserInOrg({ db, userId, organizationId: org.id }) → { role, scopes }
   │       • Slack email missing/unreadable      → DENY: "we couldn't read your Slack email"
   │       • no matching Autumn user             → DENY: "sign in with the same email / ask admin"
   │       • matching user but role === null      → DENY: "you're not a member of <org>"
   │       • member                              → continue with their scopes
   │
   ├─ [CHANGED] mint/lookup a PER-USER token bounded to those scopes
   │     (mirror ensureWebChatAuth), then pass userId into the token fetch
   │
   └─ agent runs with the user's token → server enforces scopes on every tool call
```

Two facts pin down the Phase 1 resolution:

- The **workspace** the message came from determines the **org** (1:1, enforced at install).
- The **Slack user id** determines the Slack email; Slack email is matched to the unique
  Autumn `user.email`.

Then it's just: is this user a member of this workspace's org? → role → scopes.

Phase 1 is intentionally a happy-path friction reduction. It avoids forcing every Slack
user through OAuth2 account linking. It is less explicit than account linking and depends
on Slack email matching Autumn email, so mismatched aliases will deny until we add a
fallback/linking phase.

---

## 3. The functions that do it (with sources)

### Phase 1 identity / email matching

| What | Where |
|---|---|
| Slack bot token — use it to call Slack Web API for the sender's email. Requires adding `users:read.email` to the Slack app manifest/scopes and reinstalling affected workspaces. | `apps/leaf/slack-manifest.prod.json`, `apps/leaf/slack-manifest.example.json`, `apps/leaf/src/providers/slack/oauth.ts` |
| `user` table — `email` is unique; Phase 1 matches Slack email to this column. | `shared/db/auth-schema.ts:18` |
| `member` table — holds `(userId, organizationId, role)` | `shared/db/auth-schema.ts:120` (role at `:130`) |
| Better Auth config — not needed for Phase 1 Slack identity; explicit Slack account linking is deferred. | `server/src/utils/auth.ts` (`socialProviders` ~`:241`, customSession plugin ~`:383`) |

Phase 1 does **not** use Better Auth account linking and does **not** read the `account`
table. It reads the Slack sender's email via Slack and matches it to Autumn `user.email`.
For the happy path, use the sender's email only; a workspace-wide `users.list` cache can
come later if needed, but it is not required to prove the path.

Deferred account-linking fallback: Slack can send a link to the Autumn dashboard, and the
dashboard can call `authClient.linkSocial({ provider: "slack", callbackURL })` from an
authenticated session. Keep this as Phase 2, not Phase 1.

### Scope resolution (session-free — reuse the dashboard's own helper)

| What | Where |
|---|---|
| `getScopesForUserInOrg({ db, userId, organizationId }) → { role, scopes }` — reads `member`, maps role → scopes. Returns `{ role: null, scopes: [] }` if not a member. **Same helper the dashboard session uses**, so Slack can't drift. | `server/src/utils/authUtils/customSessionScopes.ts:35` |
| `ROLE_SCOPES` — role → scope set (owner/admin/developer/sales/member) | `shared/utils/scopeDefinitions.ts:372` |
| `makeScopeChecker(granted)` / `checkScopes(required, granted)` / `expandScopes` — the pure scope engine (for optional preflight UX) | `shared/utils/scopeDefinitions.ts:806` / `:705` / `:611` |
| `DEFAULT_OAUTH_RESOURCE_SCOPES` — the bot's **ceiling** (the max the Slack OAuth client can ever hold) | `shared/utils/auth/autumnOAuthScopes.ts:8` |
| Route scope middleware currently treats empty `ctx.scopes` as legacy/unrestricted. **Do not rely on a zero-scope OAuth token as a deny mechanism.** | `server/src/honoMiddlewares/routeHandler.ts:178` |

### Per-user token minting (mirror the existing web flow)

| What | Where |
|---|---|
| `ensureWebChatAuth({ orgId, userId, userScopes })` — **the blueprint.** Mints a per-user credential bounded to scopes; re-mints when scopes change. Build the Slack analog of this. | `apps/leaf/src/internal/installations/actions/ensureWebChatAuth.ts:100` |
| `resolveAgentScopes(agentScopes?)` — bounds requested scopes to the ceiling. ⚠️ **Currently fails OPEN on empty input** (returns the full default set). Change explicit `[]` to throw/deny; keep `undefined` as the install/default path if needed. | `apps/leaf/src/internal/installations/actions/replaceInstallationOAuthCredentials.ts:321` |
| `replaceInstallationOAuthCredentials({ tx, installation, userId, agentScopes, orgId })` — provider-agnostic credential minting | `apps/leaf/src/internal/installations/actions/replaceInstallationOAuthCredentials.ts:331` |
| `getChatOAuthCredentialByInstallationEnv({ db, chatInstallationId, env, orgId, userId })` — per-user keyed lookup | `apps/leaf/src/internal/installations/repos/chatOAuthCredentialsRepo.ts:12` |

### Token resolution at message time (the line to change)

| What | Where |
|---|---|
| `getInstallationOAuthAccessToken({ installation, env, orgId, userId })` — **already accepts `userId`; Slack currently omits it.** | `apps/leaf/src/internal/installations/actions/getInstallationOAuthAccessToken.ts:26` |
| `getOrgInstallationToken({ env, orgId, provider, workspaceId, userId })` | `apps/leaf/src/internal/installations/actions/getOrgInstallationToken.ts:14` |

### Message flow — where the new step slots in

| What | Where |
|---|---|
| `runMessage()` — entry point; `providerUserId` is a param (`:47`) and carried on ctx (`:166`) | `apps/leaf/src/agent/runMessage/runMessage.ts:35` |
| Org resolved here (you now have org + providerUserId together) | `apps/leaf/src/agent/runMessage/runMessage.ts:67` |
| **Token fetched here — add `userId`** (currently no userId for Slack) | `apps/leaf/src/agent/runMessage/runMessage.ts:138` |
| `resolveSlackAdminOrgContext()` — org/installation resolution | `apps/leaf/src/agent/runMessage/setup/resolveSlackAdminOrg.ts:187` |
| `setupAgentToolContext({ env, logger, token })` — Mastra MCP client (token = scopes) | `apps/leaf/src/agent/runMessage/setup/setupAgentToolContext.ts:11` |
| `ensureAutumnVault(...)` — claude-managed harness; the per-user token must land here too | `apps/leaf/src/harness/claudeManaged/vaults/ensureAutumnVault.ts:140` |

### Install flow (Phase 1 scope change required)

| What | Where |
|---|---|
| `replaceInstallation()` — workspace→org binding; enforces **1:1** via delete `sameOrg OR sameWorkspace` | `apps/leaf/src/providers/slack/installations.ts:122` (1:1 logic `:143-160`) |
| Slack OAuth callback | `apps/leaf/src/providers/slack/routes.ts:33` |
| Slack manifests — add `users:read.email` so the bot can read Slack profile emails. Existing installs need reconnect/reinstall to grant it. | `apps/leaf/slack-manifest.prod.json`, `apps/leaf/slack-manifest.example.json` |

### Optional UX layers (signage, not security)

| What | Where |
|---|---|
| Tool scope UX. **Repo finding:** leaf only consumes MCP `destructiveHint` today; required scopes are not exposed on tools yet. Add required-scope metadata first, then prefer returning a clear permission error over hard-hiding tools. | `apps/leaf/src/agent/runMessage/setup/setupAgentToolContext.ts`, `packages/mcp/src/tools/utils/annotations.ts` |
| Prompt awareness ("acting as <user>, role X") — currently injects **no** role/scope | `apps/leaf/src/agent/prompts/buildSystemPrompt.ts:10` |

### Approvals (writes scoped to the clicker)

Approvals already record the requesting Slack user (`provider_user_id`) and the decider
(`decided_by_provider_user_id`) on the `chatApprovals` table
(`shared/models/chatModels/chatTable.ts:67` / `:80`). The deferred write must be
authorized by **whoever clicks the approval button**:

- On click, resolve `event.user.userId` → Slack email → Autumn user → role/scopes in the
  approval's org.
- If Slack email is unreadable / no matching Autumn user / not a member / unknown role /
  no usable scopes, deny without executing.
- Execute the write with the clicker's per-user token, not the requester token and not
  the installer token.
- For Claude Managed, be careful: the suspended tool call uses the session's attached
  vault. Do not simply send `allow` if that would run under a stale/requester vault.
  Either swap the session auth to the clicker's vault if Anthropic supports it, or execute
  the approved write out-of-band with the clicker's token and then deny/clear the
  suspended tool call so it cannot later run under the wrong identity.

Approval repos live under `apps/leaf/src/internal/approvals/`.

---

## 4. Implementation steps (ordered)

### Phase 1 — Slack email happy path

1. **Request Slack email scope.** Add `users:read.email` to both Slack manifests and
   reconnect/reinstall test workspaces so the bot token can read user profile emails.
   Keep `users:read`; `users:read.email` supplements it.
2. **Slack email resolver.** New function: `providerUserId` + installation bot token →
   Slack Web API → Slack email. For the first happy-path pass, resolve only the sender's
   email via `users.info`; do not build a full workspace sync/cache unless needed.
3. **Autumn user resolver.** Match Slack email to Autumn `user.email` case-insensitively,
   then call `getScopesForUserInOrg({ db, userId, organizationId: org.id })`. Return the
   user + role + scopes, or a typed deny result: `slack-email-unavailable`,
   `no-autumn-user`, `not-a-member`, `invalid-role`, `no-supported-scopes`. Use a
   discriminated union so token minting can only happen on the success branch.
4. **Per-user token.** Build the Slack analog of `ensureWebChatAuth` using
   `replaceInstallationOAuthCredentials`. Then pass `userId` into the token fetch at
   `runMessage.ts:138` (and into the vault path in `ensureAutumnVault`). Before doing
   this, change/guard `resolveAgentScopes` so explicit `[]` cannot mint default scopes.
5. **Deny paths.** On Slack email unavailable → tell them the bot cannot read their Slack
   email and the workspace may need reconnecting with the new scope. On no matching Autumn
   user → tell them no Autumn account matched their Slack email and to sign in / ask an
   admin. On not-a-member → tell them they lack access to that org. On invalid role / no
   supported scopes → tell them their org role cannot use the Slack bot and to ask an
   admin. **No fallback to the installer token in any deny case.**
6. **Approvals.** Button clicker permissions decide. Before claiming/running an approval,
   resolve the clicker's Slack email and Autumn membership in the approval org.
   Unauthorized clickers should not consume/claim the approval. Execute with the clicker's
   per-user token. For Claude Managed, avoid `allow` on a suspended call unless its vault
   is guaranteed to be the clicker's vault; otherwise execute out-of-band with the clicker
   token and deny/clear the suspended tool call.
7. **Tool scope UX.** Add required-scope metadata to MCP tool definitions. Do not hard-hide
   unavailable tools as the first pass; instead return/teach clear permission errors so
   the agent says "you don't have permission" rather than "no tool found". Prompt role
   hints are cosmetic only.

### Phase 2 — explicit account linking fallback (deferred)

If email matching creates too many false denies or we need stronger identity binding, add
Better Auth Slack account linking later:

1. Add Slack as a Better Auth social provider in `server/src/utils/auth.ts`.
2. Enable `account.accountLinking.allowDifferentEmails: true` if needed for explicit
   links with mismatched emails.
3. Add a dashboard link target that calls
   `authClient.linkSocial({ provider: "slack", ... })` from an authenticated session.
4. Add an indexed lookup on `account(provider_id, account_id)` after confirming Slack's
   stored account id shape.
5. Prefer the explicit account link over email matching when both exist.

---

## 5. Invariants & gotchas (do not violate)

- **`resolveAgentScopes([])` fails OPEN today.** An empty scope list returns the *full
  default set* (`replaceInstallationOAuthCredentials.ts:321`). A non-member resolves to
  `scopes: []`. So you **must deny before the minting code** — never let an empty/none
  scope list reach `resolveAgentScopes`. Also change explicit `[]` to throw/deny so future
  callers cannot accidentally mint default scopes.
- **A zero-scope token is not a safe deny mechanism today.** `routeHandler.ts` treats empty
  `ctx.scopes` as legacy/unrestricted. If you harden this, preserve intentional public-key
  behavior separately; don't make chat/OAuth empty scopes fail open.
- **No installer-token fallback.** The moment a sender can't be resolved, they get
  *nothing*. Falling back to the shared token reintroduces the exact bug we're fixing.
- **Email match is Phase 1 only.** Slack email matching reduces friction but is not a
  cryptographic account link. If Slack email does not exactly match Autumn email, deny;
  do not guess, fuzzy-match, or let the agent decide.
- **The AI is not the gatekeeper.** Enforcement is the token + server middleware.
- **Approvals are authorized by the clicker.** The requester created the proposed action,
  but the user who clicks approve is the authority for the deferred write.
- **The bot has a ceiling.** Scopes are bounded to `DEFAULT_OAUTH_RESOURCE_SCOPES`
  (org:read, customers/features/plans/balances/billing r/w, analytics:read). It
  **excludes** rewards, migrations, apiKeys, platform, and `admin`/`owner` meta-scopes.
  Even an org owner can't do those via Slack unless you widen the default set *and* the
  OAuth client's scopes.
- **Install must include `users:read.email`.** Without it, Phase 1 identity resolution
  cannot read Slack emails and must deny rather than fall back.
- **Membership is per-org.** An email-matched user only gets scopes in the org their
  workspace maps to; matched-but-not-a-member → denied. Correct, not a bug.

### Must-validate before relying on it

- **Slack email API shape.** Confirm the bot can read `profile.email` for a test sender
  after adding `users:read.email` and reconnecting the app. Validate both DM and channel
  mention events use the same bare Slack user id (`U...`).
- **Slack email vs Autumn email casing.** Use case-insensitive compare, but no fuzzy
  matching. `user.email` is unique; if the DB collation does not enforce case-insensitive
  uniqueness, still treat multiple matches as deny.
- **Slack bots/deleted/users without email.** Bot-authored messages are already skipped;
  deleted users or profiles without email should deny cleanly.
- **Claude Managed session auth swap.** Verify whether Anthropic sessions can safely update
  `vault_ids` / MCP auth before confirming a suspended tool. If not, approval execution
  must run out-of-band with the clicker's token and then deny/clear the suspended call.

---

## 6. Q&A (the questions that shaped this design)

**Q: The bot uses one shared token per workspace — confirm? What does that even mean?**
Confirmed. At install (`installations.ts:183`) the credential is minted with the
*installer's* `userId`. At message time `runMessage.ts:138` calls the token fetch with
**no `userId`**, so the per-user filter drops out of the query
(`chatOAuthCredentialsRepo.ts:31-32`) and every sender resolves to that one installer
credential. "Shared token" = one workspace-wide identity; the sender is never considered.

**Q: As the bot, can we just see anyone's email in the workspace?**
Not with the current manifest — it has `users:read` but not `users:read.email`
(`slack-manifest.prod.json:28`). Phase 1 changes this: add `users:read.email`, reconnect
the workspace, and read the sender's Slack email via Slack Web API. Then match that email
to Autumn `user.email`.

**Q: What's the cleanest way to build the identity layer?**
For lowest friction, Phase 1 is Slack email → Autumn email. It is simple and avoids making
every Slack user run an OAuth2 linking flow. The tradeoff is that email matching is a
heuristic: mismatched aliases deny. Explicit OAuth account-link via Better Auth is the
cleaner long-term fallback if we need stronger identity binding.

**Q: Can we even check THAT user's permissions in the bot? Do they have a role?**
Yes. Every membership has a `role` (`member` table). `getScopesForUserInOrg`
(`customSessionScopes.ts:35`) reads it and maps to scopes — **a pure DB read, no session
required.** It's the same helper the dashboard uses. Note: the bot's tools are *product*
actions → Autumn's scope system, **not** Better Auth's AccessControl (that's only for
better-auth's own org-management endpoints).

**Q: Do the scopes get sent down to the AI agent to decide if the user can do something?**
No — and they shouldn't. The token carries the authority; the server enforces it. The
agent can *try* a tool and just gets a 403 if out of scope. Today nothing about
permissions even reaches the prompt (`buildSystemPrompt.ts` has no role/scope). Optional:
inject a role hint for nicer messaging — but that's cosmetic.

**Q: How does the agent "see" the Autumn user while it's in Slack?**
It doesn't see a user object. The Slack `event.user` is resolved to a Slack email, then to
an Autumn `userId`; that `userId` mints a scoped token; the token is how the user's
authority reaches the agent's tools. "Seeing the user" = "minting the right token from the
resolved identity."

**Q: One user might have multiple orgs and thus multiple Slack accounts?**
Handled with zero runtime disambiguation. One Autumn user → many orgs (per-org roles);
one user may appear in many Slack workspaces. The workspace fixes the org; the Slack id
fetches the email; the email fixes the Autumn user; then membership(user, org) → role.
Example: admin in Org A, member in Org B → admin scopes in workspace A, member scopes in
workspace B, automatically.

**Q: Do we maintain our own linking table or use Better Auth directly?**
Phase 1 uses no linking table. It matches Slack email to Autumn `user.email`. If/when we
add explicit OAuth account linking, use Better Auth's `account` table directly — it *is*
the link table. Don't build a parallel mirror.

**Q: Can Better Auth even link multiple accounts of the same provider?**
Probably yes (implied by `unlinkAccount({ providerId, accountId })` disambiguating within
a provider, and `listAccounts()` returning all), but this is Phase 2. It is not needed for
the Phase 1 Slack-email happy path.

**Q: Do the resolved scopes go nicely into the existing Slack solution?**
Yes — the scope shape (`ScopeString[]`) is exactly what the existing minting path
consumes, and web already does this per-user with the same functions. `resolveAgentScopes`
even intersects role scopes with the bot ceiling for free (member → read-only token,
admin → full default token). The *only* new guard: deny unreadable-email / no-user /
non-member cases **before** minting, because `resolveAgentScopes([])` fails open.

**Q: Can we filter tools by scope before handing them to the agent?**
Yes, but not with the metadata leaf has today. MCP tools currently expose
`destructiveHint`; they do **not** expose required scopes. Add required-scope metadata to
the MCP tool definitions first. For UX, prefer wrapping unauthorized tools with a clear
permission error (or prompt hints) over hard-removing them, otherwise the agent may say
"no tool found" instead of "you don't have permission."

**Q: If `resolveAgentScopes([])` is wrong, can we just mint a zero-scope token?**
Not safely today. The server scope middleware treats empty `ctx.scopes` as a legacy
unrestricted signal. Correct behavior is: Slack email unreadable / no matching Autumn user
/ not-a-member / invalid role / no usable scopes → no token at all, plus a denial message.
Separately, explicit `[]` should be guarded in the credential minting path so it cannot
become default scopes.

**Q: For approvals, whose permissions matter?**
The user who clicks the button. Resolve the clicker's Slack email → Autumn user and execute
with the clicker's per-user token. Unauthorized clickers should not claim or consume the
approval.

---

## 7. Status

Branch target is `feat/match-slack-scopes`.

**Phase 1 happy path — implemented** (§4 steps 1–5):

- `users:read.email` added to both Slack manifests (existing installs must reconnect).
- `getScopesForUserInOrg` lifted into `@autumn/shared`
  (`shared/utils/auth/getScopesForUserInOrg.ts`) and re-exported from the server's
  `customSessionScopes.ts`, so the dashboard and Slack share one role→scope source.
- Slack email resolver: `apps/leaf/src/providers/slack/users.ts` (`fetchSlackUserEmail`).
- Identity orchestrator: `apps/leaf/src/agent/runMessage/setup/resolveSlackUserAuth.ts`
  — email → unique Autumn user → role/scopes → bound to ceiling → mint per-user
  credential. Returns a discriminated union; minting only on the success branch.
  Typed denies: `slack-email-unavailable`, `no-autumn-user`, `not-a-member`,
  `invalid-role`, `no-supported-scopes` (each with a user-facing message; **no installer
  fallback**).
- Per-user credential mint extracted to
  `apps/leaf/src/internal/installations/actions/ensureChatUserCredential.ts` (shared by
  web + Slack); `ensureWebChatAuth` now delegates to it.
- `resolveAgentScopes` hardened: `undefined` → default set, explicit `[]` → throw,
  bounded-empty → throw (no fail-open).
- `runMessage` resolves non-admin Slack senders, denies early on failure, and threads the
  resolved Autumn `userId` into the token fetch and `ctx.autumnUserId`; the CMA engine
  uses `ctx.autumnUserId` for the vault (web sets it = dashboard user). Slack admin installs
  keep the installer-scoped flow.

**Deferred (not yet implemented):**

- §4 step 6 — approvals scoped to the button clicker.
- §4 step 7 — required-scope metadata / tool-scope UX.
- Phase 2 (§4) — explicit Better Auth account-linking fallback.
