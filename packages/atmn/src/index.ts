/**
 * The package's import surface for a config: the builders and `atmn()`.
 * Source-backed for workspace links; a built entry follows for npm.
 */
export { type Feature, feature } from "./generated/features.js";
export { type License, license } from "./generated/licenses.js";
export { type Plan, plan } from "./generated/plans.js";
export {
	type ReferralProgram,
	referralProgram,
} from "./generated/referralPrograms.js";
export {
	type Coupon,
	coupon,
	type FeatureGrant,
	featureGrant,
	type Reward,
} from "./generated/rewards.js";
export { type Variant, variant } from "./generated/variants.js";
export { type AtmnConfig, atmn } from "./generated/wire.js";
