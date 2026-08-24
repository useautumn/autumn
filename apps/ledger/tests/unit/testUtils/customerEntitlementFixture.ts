import {
	AllowanceType,
	AppEnv,
	EntInterval,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";

const CREATED_AT = 1_600_000_000_000;

export const featureFixture = (id = "messages"): Feature => ({
	internal_id: `fi_${id}`,
	org_id: "org_1",
	created_at: CREATED_AT,
	env: AppEnv.Sandbox,
	id,
	name: id,
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Single },
	archived: false,
	event_names: [],
});

export type CustomerEntitlementFixture = {
	id: string;
	balance: number;
	allowance?: number;
	adjustment?: number;
	usageAllowed?: boolean;
	usageLimit?: number | null;
	unlimited?: boolean;
	feature?: Feature;
};

// A customer-level balance row with no product, so the shared helpers read its
// clamps straight off the entitlement: max_balance = allowance,
// min_balance = -(usage_limit - allowance) whenever overage is allowed.
export const customerEntitlementFixture = ({
	id,
	balance,
	allowance = 0,
	adjustment = 0,
	usageAllowed = false,
	usageLimit = null,
	unlimited = false,
	feature = featureFixture(),
}: CustomerEntitlementFixture): FullCusEntWithFullCusProduct => ({
	id,
	internal_customer_id: "icus_1",
	internal_entity_id: null,
	internal_feature_id: feature.internal_id,
	feature_id: feature.id,
	customer_product_id: null,
	entitlement_id: `ent_${id}`,
	created_at: CREATED_AT,
	unlimited,
	balance,
	additional_balance: 0,
	adjustment,
	usage_allowed: usageAllowed,
	separate_interval: false,
	is_pooled_balance: false,
	next_reset_at: null,
	expires_at: null,
	external_id: null,
	cache_version: 0,
	entitlement: {
		id: `ent_${id}`,
		created_at: CREATED_AT,
		internal_feature_id: feature.internal_id,
		internal_product_id: "iprod_1",
		is_custom: false,
		allowance_type: unlimited ? AllowanceType.Unlimited : AllowanceType.Fixed,
		allowance,
		interval: EntInterval.Month,
		interval_count: 1,
		entity_feature_id: null,
		pooled: false,
		feature_id: feature.id,
		usage_limit: usageLimit,
		feature,
	},
	replaceables: [],
	rollovers: [],
	customer_product: null,
});
