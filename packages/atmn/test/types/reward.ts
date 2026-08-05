import type { Reward } from "../../src/compose/index.js";

type RewardDuration = Exclude<Reward, { type: "feature_grant" }>["duration"];
type GrantExpiry = NonNullable<
	Extract<Reward, { type: "feature_grant" }>["grants"][number]["expiry"]
>;
type FeatureGrant = Extract<Reward, { type: "feature_grant" }>;

({ type: "months", length: 1 }) satisfies RewardDuration;
({ type: "one_off" }) satisfies RewardDuration;
({ type: "forever" }) satisfies RewardDuration;

// @ts-expect-error Month durations require a length.
({ type: "months" }) satisfies RewardDuration;
// @ts-expect-error Non-month durations cannot specify a length.
({ type: "forever", length: 1 }) satisfies RewardDuration;
// @ts-expect-error Feature grant expiry does not support hours.
({ type: "hour", length: 1 }) satisfies GrantExpiry;

({ featureId: "credits" }) satisfies FeatureGrant["grants"][number];
({ code: "REFER" }) satisfies FeatureGrant["promoCodes"][number];

// @ts-expect-error Feature grants require at least one grant.
[] satisfies FeatureGrant["grants"];
// @ts-expect-error Feature grants require at least one promo code.
[] satisfies FeatureGrant["promoCodes"];

// @ts-expect-error Invoice credits cannot be represented in a pushable config.
({ type: "invoice_credits" }) satisfies Pick<Reward, "type">;
