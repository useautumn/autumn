# Sentry signal: a strategy for high-signal error notifications

Status: proposal 2026-09-30. Supersedes the first draft of this file.

## Evidence: the first 6h after the logger-hook release

```
AUTUMN-SERVER-FT  ~40 ev  LoggedMessageError "[SyncV4]/[SyncDirty] … SQS batch accumulator is shutting down"
                          → deploy-time shutdown noise; two different call sites merged into one issue
AUTUMN-SERVER-FQ   21 ev  LoggedMessageError "Account ID … not linked to any org, skipping Stripe webhook"
                          → expected condition logged at error
AUTUMN-SERVER-FN    6 ev  LoggedMessageError "error handling revenuecat webhook RecaseError: Cus product not found"
                          → a RecaseError logged as text, so never classified
AUTUMN-SERVER-FS        LoggedMessageError "❌ Stripe error: … insufficient funds"
                          → end customer's card
AUTUMN-SERVER-99   31 ev  Error: Query read timeout            → transient (pg)
AUTUMN-SERVER-9K   17 ev  InternalError: Entitlement not found → real bug
```

Pattern: the new noise is almost entirely **text-only `logger.error` lines of conditions that are
expected or transient**. The hook can't classify text, so every one becomes a "bug".

## Principles (from Google SRE ch. 6, Sentry's triage guidance, and how teams run inbox-zero)

1. **A notification must be novel and actionable.** "This happened again" is not a notification;
   new, regressed, escalating or spreading is. (SRE: "pages should be about a novel problem".)
2. **Sentry is the inbox, Slack is the doorbell.** Everything lands in Sentry; Slack only rings for
   the four transitions above. Volume and trends live in Axiom dashboards and Sentry views.
3. **Fix noise at the source, never by muting.** If an alert can be ignored, the error was
   mis-classified: make it `expected` (warn) or `transient` (rate-alerted) in code.
4. **Say who, what, where in the message itself.** Org, env, operation, service, customer on every
   alert; the title says what happened, the culprit says where in our code.
5. **Every alerted issue ends in a decision.** Fix, resolve, archive-until-escalating, or reclassify.
   Nothing stays "unresolved and ignored".

## The model

```
               ┌──────────── code decides what an error IS ────────────┐
error ────────►│ expected   → Axiom (warn), never Sentry               │
               │ transient  → Sentry warning, 1 issue/dependency       │
               │ bug        → Sentry error                             │
               └───────────────────────────────┬───────────────────────┘
                                               ▼
               ┌──────────── Sentry decides when to ring ──────────────┐
               │ 🔴 live bug   new | regressed | escalating            │
               │ 🟡 sandbox bug  same, lower-urgency note               │
               │ 🚨 spreading  bug hitting > 3 orgs in 1h               │
               │ 🟠 degraded   transient rate over threshold (later)    │
               │ silent        everything else → For Review / weekly    │
               └───────────────────────────────┬───────────────────────┘
                                               ▼
               ┌──────────── humans decide what happens ───────────────┐
               │ assign+fix · resolve · archive-until-escalating ·      │
               │ reclassify in code · delete & discard                  │
               └───────────────────────────────────────────────────────┘
```

### Slack message anatomy (all fields Sentry can show)

```
🔴 <title: what happened, from the log message>      ← code
<culprit: our call site, file + function>            ← code + stack trace rules
<message>
tags: org_slug · env · operation · service · customer_id   ← alert "show tags"
notes: 🔴 live | 🟡 sandbox — lower urgency                  ← alert "notes"
thread: investigation bot reply                            ← existing
```

## Workstreams

### A. Sentry config (MCP can do alerts + issue states; stack trace rules are UI-only)

```
Alert "Bug" (edit rule 2925781, keep #scans/#errors channel id)
  when  new issue | regression | escalating
  block live:    error_kind = bug, env ≠ sandbox → Slack, tags, note 🔴
  block sandbox: error_kind = bug, env = sandbox → Slack, tags, note 🟡 lower urgency
  keep  existing Discord action unchanged
Alert "Bug spreading" (new)
  when  event captured
  if    error_kind = bug, orgs > 3 in 1h → Slack, note 🚨, once/issue/day
Stack Trace Rules (Project → Issue Grouping, UI)
  stack.abs_path:**/packages/errors/**     -app
  stack.abs_path:**/external/logtail/**    -app
Backlog reset
  archive-until-escalating every unresolved issue older than 7 days,
  so "regressed/escalating" mean something from day one
```

`env ≠ sandbox` (not `= live`) so bugs with no org context (crons, pre-auth) still alert.

### B. Code: make the signal correct (`@autumn/errors` + call sites)

1. **Text-only errors carry their Error.** Top offenders first (FT, FQ, FN, FS): log `{ error }`
   so the classifier sees `RecaseError`/Stripe types; expected conditions log at `warn`.
2. **Title, culprit, grouping for text-only lines.** Title = the log message, stack trimmed to the
   call site, fingerprint = call site, so `[SyncV4]` and `[SyncDirty]` stop merging and IDs in the
   text don't split issues.
3. **`StripeCardError` → expected.** The end customer's card, never our bug.
4. **Transient kind (unit 4).** SQS accumulator shutdown, pg timeouts, Tinybird 5xx → `transient`:
   Sentry `warning`, fingerprint per dependency, 🟠 rate alert instead of per-issue alert.

### C. Process

- Suggested assignees via ownership rules by path (billing, balances, webhooks…), shown in Slack.
- Weekly 20-minute review of the For Review list and top issues by orgs affected; output is a
  decision per issue (principle 5).
- Budget: ≤ 3 🔴 per day. Over budget means reclassify in code, not mute.

## Order

1. A (config) now: turns the channel quiet and tagged immediately.
2. B1 + B2 + B3: one PR, removes most of the current new-issue noise.
3. B4 (transient) + 🟠 rate alert.
4. C once the volume is low enough to review weekly.
