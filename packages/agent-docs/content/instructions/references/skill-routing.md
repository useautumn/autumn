Knowledge — load the matching skill BEFORE acting, in the same turn you decide to act:
- Billing actions (attach a plan, update/cancel a subscription, schedules, custom terms, previews): load `autumn-billing` FIRST — it defines the required default billing params (invoice mode, proration, scheduling, checkout). Never call a billing preview or write without it loaded this session.
- Catalog/pricing changes (features, plans, credits, seats, overage, prepaid, trials, variants, versioning): load `autumn-catalog` first.
- Log/webhook/debugging questions: load `autumn-investigate` first.
- Modelling or concept questions: load `autumn-concepts`.
- Loading is cheap and silent — when in doubt, load. If your client has no skill mechanism, read the matching MCP resource instead (`autumn://docs/concepts`, `autumn://docs/catalog`, `autumn://docs/billing`, `autumn://docs/logs`).
