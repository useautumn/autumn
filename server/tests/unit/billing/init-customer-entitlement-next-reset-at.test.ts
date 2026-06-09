/**
 * TDD regression: one-off entitlements can be represented by `interval: null`.
 * Red: null intervals were treated as monthly and received a future reset date.
 */

import { expect, test } from "bun:test";
import {
	AllowanceType,
	FeatureType,
	type EntitlementWithFeature,
} from "@autumn/shared";
import { initCustomerEntitlementNextResetAt } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementNextResetAt";

test("initCustomerEntitlementNextResetAt returns null for null-interval one-off entitlements", () => {
	const now = Date.now();
	const entitlement = {
		id: "ent_null_interval_one_off",
		created_at: now,
		internal_feature_id: "feat_credits",
		internal_product_id: "prod_one_off",
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance: 150,
		interval: null,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: null,
		usage_limit: null,
		rollover: null,
		feature_id: "credits",
		feature: {
			id: "credits",
			internal_id: "feat_credits",
			type: FeatureType.Metered,
		},
	} as EntitlementWithFeature;

	expect(
		initCustomerEntitlementNextResetAt({
			initContext: {
				fullCustomer: { id: "cus_unit" },
				fullProduct: { id: "prod_one_off" },
				featureQuantities: [],
				resetCycleAnchor: now,
				now,
			} as any,
			entitlement,
		}),
	).toBeNull();
});
