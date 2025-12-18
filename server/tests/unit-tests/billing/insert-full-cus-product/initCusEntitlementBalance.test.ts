import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	type AttachReplaceable,
	type EntitlementWithFeature,
	type Feature,
	type FeatureOptions,
	FeatureType,
	type InitFullCusProductContext,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { initCusEntitlementBalance } from "@/internal/billing/billingUtils/initFullCusProduct/initCusEntitlementV2/initCusEntitlementBalance";

const createMockEntitlement = ({
	feature,
	featureType,
	allowanceType,
}: {
	feature: Feature;
	featureType: FeatureType;
	allowanceType: AllowanceType;
}): EntitlementWithFeature => ({
	id: "ent_test",
	created_at: Date.now(),
	internal_feature_id: "feat_internal",
	internal_product_id: "prod_internal",
	is_custom: false,
	allowance_type: allowanceType,
	allowance: 100,
	interval: null,
	interval_count: 1,
	carry_from_previous: false,
	entity_feature_id: null,
	feature_id: "feat_test",
	usage_limit: null,
	rollover: null,
	feature,
});

const createMockInsertContext = (): InitFullCusProductContext => ({
	fullCus: {} as InitFullCusProductContext["fullCus"],
	product: {} as InitFullCusProductContext["product"],
	featureQuantities: [] as FeatureOptions[],
	replaceables: [] as AttachReplaceable[],
});

describe(chalk.yellowBright("initCusEntitlementBalance"), () => {
	test("returns { newBalance: 0, newEntities: null } for boolean entitlements", () => {
		const booleanFeature = ctx.features.find(
			(f) => f.type === FeatureType.Boolean,
		)!;

		const entitlement = createMockEntitlement({
			feature: booleanFeature,
			featureType: FeatureType.Boolean,
			allowanceType: AllowanceType.Fixed,
		});

		const result = initCusEntitlementBalance({
			insertContext: createMockInsertContext(),
			entitlement,
		});

		expect(result).toEqual({ balance: 0, entities: null });
	});
});
