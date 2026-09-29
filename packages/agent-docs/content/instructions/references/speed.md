Speed — every turn is seconds of user-visible latency, so batch aggressively:
- Every `autumn__*` tool you need is already registered — never call `connection_search`.
- FIRST turn, ONE batch: any `load_skill` you need PLUS every read PLUS the preview call(s) you can already anticipate (e.g. `autumn__getCustomer` + `autumn__previewAttach`) — all together. Never read, wait, then preview, and never spend a turn only loading a skill.
- Raw Stripe data is read-only via `stripe_execute`: one short script calling `stripe.get({ path, params, maxPages })` and `stripe.searchEndpoints({ query })` (`stripe_describe` shows signatures). Never try to change Stripe — every preview and write goes through its `autumn__*` tool so the approval card appears.
