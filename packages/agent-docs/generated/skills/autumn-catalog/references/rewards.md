# Rewards

Rewards are coupons or feature grants; referral programs hand them out. In a catalog update they are stated collections like plans: `rewards` and `referralPrograms` in `autumn.config.ts`, `rewards` and `referral_programs` in the API payload. Omit a collection to leave it untouched; an empty one under a complete payload deletes every reward. List existing rewards first and confirm plan and feature ids before creating one.

Rules:

- Each reward is exactly one of `coupon` or `feature_grant`.
- Coupons are `percentage_discount` (at most 100) or `fixed_discount` (major currency units). `plan_ids: null` means every plan; otherwise name current plan ids.
- Duration: `months` needs a positive `length`; `one_off` and `forever` need `length: null`.
- A feature grant needs at least one grant and one promo code. A boolean feature is granted with `included: null`; metered and credit features need a positive amount.
- Reward ids, promo codes, plan ids and feature ids within one reward are unique.
