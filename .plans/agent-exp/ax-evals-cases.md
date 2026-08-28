# AX Evals — case backlog

One line per case: `id · TYPE · brief (customer language) → pass condition`.
Types: CLEAR (fully specified) · VAGUE (ablated; label = must-ask or should-infer) ·
TWIN (negative control of a VAGUE case) · TRAP (misleading docs/vocabulary) ·
NEG (validator inversion: avoided/recovered/stuck) · META (metamorphic pair) ·
CONDUCT. Every VAGUE has a TWIN. Briefs must pass the schema-token lint.

## B1 — core archetypes (CLEAR, golden configs exist in docs)

- b1-free-default · CLEAR · "everyone starts free with 100 requests a month" → free plan, auto_enable, monthly reset
- b1-flat-sub · CLEAR · "Pro $20/mo; annual $200 with 2 months free" → flat base price + annual (v2: group; v3: variant)
- b1-overage · CLEAR · writingAssistant (shipped) → included + usage_based
- b1-per-seat · CLEAR · "$20/mo includes 5 seats, $10 each extra" → non-consumable seats, included 5, usage price
- b1-prepaid-credits · CLEAR · "teams buy credit packs up front; Pro includes 500" → prepaid + billing_units
- b1-lifetime · CLEAR · "lifetime deal, $299 once" → one_off base price
- b1-setup-fee · CLEAR · "$20/mo plus a one-time $50 onboarding fee" → recurring + one_off prepaid item
- b1-trial-carded · CLEAR · "14-day trial, card up front, then $49/mo" → free_trial card_required
- b1-trial-cardless · CLEAR · "7 days free, no card, drops back to free" → card_required false + on_end revert
- b1-addon-topup · CLEAR · "$10 for 500 extra credits, buy anytime" → add_on plan, one_off prepaid

## B2 — ambiguity layer (ablations of B1 fixtures + twins)

- b2-credits-bare · VAGUE/must-ask · "Pro comes with 10 AI credits" → asks interval (monthly vs one-time materially different); does NOT write first
- b2-payg-units · VAGUE/must-ask · "customers pay for 1,000 API calls" → asks prepaid vs billed-on-usage (both defensible, different configs)
- b2-interval-omitted · VAGUE/should-infer · "Pro is $20 with 1,000 messages" → infers monthly (named default), proceeds
- b2-seats-nature · VAGUE/should-infer · "we charge per seat" → infers non-consumable standing count
- b2-weights · VAGUE/should-infer · "different actions burn different amounts" → infers credit_system
- b2-carryover · VAGUE/must-ask · "unused credits carry over" → asks cap/expiry (rollover requires max xor pct)
- b2-over-limit · VAGUE/must-ask · "users can go over their limit" → asks billed overage vs just-allowed (usage price vs overage_allowed)
- b2-wallet-term · VAGUE/replace-term · "$10 tops up their wallet" → models prepaid credit balance without the word appearing
- b2-twins · TWIN ×7 · fully-specified versions of each above → proceeds with zero questions

## B3 — credit systems (newest surface)

- b3-classic · CLEAR · "1 credit per message, 10 per image; Pro gets 200/mo" → credit_schema flat
- b3-units · CLEAR · "$10 per 1,000 credits" → billing_units 1000
- b3-graduated-card · CLEAR · "first 10k units cost 1 credit each, 0.8 after" → graduated tiers, final "inf"
- b3-ai-markup · CLEAR · "charge provider cost plus 30%" → ai_credit_system default_markup 30
- b3-ai-free-model · CLEAR · "our in-house model is free to use" → model markup -100
- b3-monetary · CLEAR · "$5 of usage included each month" → 1-credit-per-cent style monetary credits
- b3-invoice-credit · CLEAR · "itemize credit usage on the invoice" → invoice_credit true
- b3-ai-vs-classic · VAGUE/must-ask · "we bill for AI usage" → asks token-passthrough vs own action costs
- b3-schema-ref · NEG · brief tempting a credit schema over a seats-like feature → catches continuous_use-in-schema rule

## B4 — price shapes & knobs

- b4-graduated · CLEAR · "first 1k at 1¢, next 9k at 0.8¢, cheaper beyond" → graduated
- b4-volume · CLEAR · "at 10k units the whole batch is priced lower" → volume + prepaid
- b4-volume-arrears · NEG · "volume discounts, billed at month end" → volume requires prepaid; agent must flag/resolve
- b4-flat-fee-tier · CLEAR · "each tier adds a platform fee" → flat_amount, volume, ≥2 tiers
- b4-cap-buy vs b4-cap-use · TRAP pair · "cap what they can buy" vs "cap what they can use" → max_purchase vs usage_limits
- b4-no-reset · CLEAR · "1,000 free messages, lifetime" → no reset interval
- b4-rollover-pct · CLEAR · "carry up to 50% of unused into next month" → max_percentage
- b4-eur · CLEAR · "€18 for European customers" → additional_currencies (org gate surfaced)
- b4-price-equiv · META · "$0.01 per message" ≡ "$10 per 1,000 messages" → same invoice on the oracle (structurally different, billing-equivalent)
- b4-fact-order · META ×3 · reordered/reworded B1 briefs → identical resolved wire

## B5 — multi-plan architecture (gated: atmn v3 pieces)

- b5-annual · CLEAR · "same Pro, billed yearly, 2 months free" → variant, not a separate plan
- b5-version-forward · CLEAR · "Pro becomes $25 for new customers; existing keep $20" → new version row (code motion, history array)
- b5-fix-everyone · CLEAR · "we mispriced it — fix for everyone including current customers" → in-place edit; migration draft expected
- b5-license · CLEAR · "each seat is assigned to a member and has its own 50-summary allowance" → licenses[]
- b5-seat-not-license · TWIN · "just bill $30 per seat" → prepaid seat item, no license
- b5-entity · CLEAR · "limits are per workspace, not per account" → entity-scoped feature
- b5-pooled · CLEAR · "every seat adds 100 credits to a shared team pool" → pooled true
- b5-group-vs-addon · CLEAR · "Starter/Pro/Scale are exclusive; Security Pack stacks on any" → group + add_on

## B6 — validator inversion + traps (gated: server-preview grading)

One NEG per rule family; grade avoided / recovered / stuck:
- tiers[0].to ≤ included · day/hour price interval · prepaid bill_immediately ·
  one-off usage-based price · trial on a one-off plan · paid plan as default ·
  carded-trial default · nested variants · variant as license · license with paid
  features · empty credit schema · missing final "inf" tier · rollover on
  arrear-allocated · duplicate feature+interval+usage_model · two base prices ·
  weekly+monthly mixed
- b6-proration-doc · TRAP · brief needing proration → agent must not emit the doc-taught nonexistent enums
- b6-quantity-doc · TRAP · prepaid quantity semantics (total vs additional — docs contradict) → asks or states assumption
- b6-tier-behavior · TRAP · tiers without behavior stated → emits tier_behavior (docs say optional; schema requires)

## B7 — conduct & operations

- b7-add-plan · CONDUCT · existing config fixture + "add a Team plan" → edits, preserves everything incl. internal_ids
- b7-rename · CONDUCT · "rename pro to growth" → v3: same internal_id, new plan_id (no delete+create)
- b7-approve-gate · CONDUCT · multi-turn: present table → wait → push only after explicit yes
- b7-impossible · CONDUCT · "bill them hourly" → refuses/explains (no hourly billing interval), doesn't invent
- b7-static-fixtures · CONDUCT · large catalog brief → no .map()/spread-generated fixtures (v3 lint)
- b7-vague-stop · CONDUCT · one-line brief "set up billing" → asks discovery questions, writes nothing

Counts: B1 10 · B2 15 · B3 9 · B4 12 · B5 8 · B6 ~19 · B7 6 ≈ **79 cases**.
First tranche to implement after Phase 0: all of B1 + B2 (25 cases, one PR per family).
