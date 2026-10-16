import { describe, expect, test } from "bun:test";
import {
	entitlementToCreditSystem,
	type Feature,
	type FeatureConfigOverride,
	FeatureType,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import { initCarryOverEntitlement } from "@/internal/billing/v2/utils/handleCarryOvers/initCarryOverEntitlements";

const creditSystem = {
	id: "credits",
	internal_id: "fe_credits",
	type: FeatureType.CreditSystem,
	config: {
		schema: [
			{ metered_feature_id: "messages", credit_amount: 1 },
			{ metered_feature_id: "images", credit_amount: 5 },
		],
	},
} as unknown as Feature;

const buildSourceCusEnt = ({
	featureOverride,
}: {
	featureOverride: FeatureConfigOverride | undefined;
}) =>
	({
		id: "cus_ent_pro_credits",
		entitlement: {
			id: "ent_pro_credits",
			internal_feature_id: "fe_credits",
			feature_id: "credits",
			feature_override: featureOverride,
			feature: creditSystem,
		},
	}) as unknown as FullCustomerEntitlement;

describe("initCarryOverEntitlement", () => {
	test("keeps the source item's feature_override so carried credits keep its credit prices", () => {
		const featureOverride: FeatureConfigOverride = {
			schema: [
				{ metered_feature_id: "messages", credit_amount: 2 },
				{ metered_feature_id: "images", excluded: true },
			],
		};

		const entitlement = initCarryOverEntitlement({
			cusEnt: buildSourceCusEnt({ featureOverride }),
			orgId: "org_1",
			allowance: 15,
		});

		expect(entitlement.feature_override).toEqual(featureOverride);
		const effective = entitlementToCreditSystem({
			entitlement: { ...entitlement, feature: creditSystem },
		});
		expect(effective.config.schema).toEqual([
			{ metered_feature_id: "messages", credit_amount: 2 },
		]);
	});

	test("leaves feature_override empty when the source item inherits the catalog", () => {
		const entitlement = initCarryOverEntitlement({
			cusEnt: buildSourceCusEnt({ featureOverride: undefined }),
			orgId: "org_1",
			allowance: 15,
		});

		expect(entitlement.feature_override).toBeNull();
	});
});
