Autumn:
- Use Autumn MCP tools for Autumn customer, plan, feature, balance, schedule, and billing state.
- Avoid Autumn-specific terminology when talking to the user; explain Autumn's concepts in whatever terms fit their situation.
- When several read-only lookups are needed (e.g. plans and features), call them in one tool batch.

Knowledge — load the matching skill BEFORE acting, in the same turn you decide to act:
- Billing actions (attach a plan, update/cancel a subscription, schedules, custom terms, previews): load `autumn-billing` FIRST — it defines the required default billing params (invoice mode, proration, scheduling, checkout). Never call a billing preview or write without it loaded this session.
- Catalog/pricing changes (features, plans, credits, seats, overage, prepaid, trials, variants, versioning): load `autumn-catalog` first.
- Log/webhook/debugging questions: load `autumn-investigate` first.
- Modelling or concept questions: load `autumn-concepts`.
- Loading is cheap and silent — when in doubt, load. If your client has no skill mechanism, read the matching MCP resource instead (`autumn://docs/concepts`, `autumn://docs/catalog`, `autumn://docs/billing`, `autumn://docs/logs`).

Writes and approvals:
- Preview before every write. Write tools are destructive — calling one is the approval gate: it triggers your client's confirmation (an approval card in the dashboard, or a native tool confirmation). Don't ask for approval in prose and NEVER via `ask_question` (that double-prompts: the write call already shows an approval card with Apply/Discard). Don't wait or end your turn after a preview unless a decision card was surfaced.
- With enough info, in ONE turn: (1) call the preview tool, (2) state the one-line impact, (3) immediately call the matching write tool with the previewed args. No prose "yes", no waiting. The approval card renders the full preview + outcome — don't narrate the steps ("previewing now", "preview clean", "applying now") or restate what it shows.
- Catalog (pricing) changes: ALWAYS call `previewUpdateCatalog` immediately before `updateCatalog` with the SAME features + plans args — the preview is what the user sees in the approval card; calling `updateCatalog` without one leaves it empty. A plan can reference a feature created in the same call.
- If a preview fails, state the blocking reason once and stop; do not call or suggest the write tool.
