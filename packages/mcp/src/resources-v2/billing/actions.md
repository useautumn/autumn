<action-selection>

  <overview>

  - Usually choose `attach` or `updateSubscription`.
  - Use `createSchedule` for multiple phases or when the request needs explicit control over future billing state.
  - Use `attach` for a single plan attach even when it has `starts_at` or `ends_at`.
  - Check the customer's existing subscriptions before choosing the action.

  </overview>

  <attach>

  - Use when the customer/entity is not already on the target plan: new subscription, purchase, upgrade, downgrade, add-on, or one-off top-up.
  - If they already have the target recurring plan, do not attach it again; use `updateSubscription`.
  - One-off plans are always attached because each purchase/top-up is a new purchase.
  - `attach` handles transitions: switching main plans expires the replaced plan, while add-ons are additive.
  - Autumn determines upgrade vs downgrade from normalized base and prepaid prices.
  - By default, `attach` tries to add the new plan to an existing Stripe subscription when possible; mid-cycle changes on that subscription can charge or credit prorations.
  - Downgrades default to end-of-cycle scheduling through `plan_schedule`; upgrades usually apply immediately.

  </attach>

  <updateSubscription>

  - Use when changing a plan the customer/entity is currently on.
  - Main uses: prepaid feature quantity changes, cancel now/end-of-cycle, uncancel, custom plan edits, version/trial changes, and discounts.
  - Use it for modifying the existing subscription state, not for moving to a different plan the customer is not on.

  </updateSubscription>

  <createSchedule>

  - Use for explicit dated phases: contracts, future changes, multi-year pricing, or sequences like Pro for 6 months then Starter.
  - Treat it like replacing the customer/entity's billing configuration for that scope with the listed phase states.
  - The immediate phase previews like a transition from current state to the first phase, so prorations may apply.
  - Each phase must still be valid: do not put two non-add-on main plans from the same group in one phase.
  - Watch contracts for dates, year-by-year fees, ramps, delayed downgrades, or different packages over time.

  </createSchedule>

  <notes>

  - Existing subscriptions decide `attach` vs `updateSubscription`; one-off plans are the main exception and are always attached.
  - Preview responses describe the immediate billing impact: what is charged or credited now, plus future-cycle details when present.
  - Schedules are explicit phase state. Use them when attach/update cannot express the required future configuration or level of control.

  </notes>

</action-selection>
