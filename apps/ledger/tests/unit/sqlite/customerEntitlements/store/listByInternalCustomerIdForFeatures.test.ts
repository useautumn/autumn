import { describe, expect, it } from "bun:test";
import { AllowanceType, AppEnv, EntInterval } from "@autumn/shared";
import { customerEntitlementStore } from "../../../../../src/sqlite/customerEntitlements/store/customerEntitlementStore.js";
import { featureStore } from "../../../../../src/sqlite/features/store/featureStore.js";
import { createTestShardContext } from "../../../testUtils/createTestShardContext.js";
import { seedSubject } from "../../../testUtils/seedSubject.js";

const ORG_ID = "org_1";
const ENV = AppEnv.Sandbox;

describe("customerEntitlementStore.listByInternalCustomerIdForFeatures", () => {
	const seed = () => {
		const ctx = createTestShardContext();
		const { internalCustomerId } = seedSubject({
			ctx,
			orgId: ORG_ID,
			env: ENV,
			customerId: "cus_1",
			entitlements: [
				{
					featureId: "messages",
					balance: 12.5,
					allowance: 100,
					usageAllowed: true,
					usageLimit: 200,
					expiresAt: 1_800_000_000_000,
				},
				{ featureId: "credits", balance: 40, allowance: 40 },
			],
		});
		const feature = featureStore.getByFeatureId({
			ctx,
			orgId: ORG_ID,
			env: ENV,
			featureId: "messages",
		});
		if (!feature) throw new Error("seeded feature missing");

		return { ctx, internalCustomerId, feature };
	};

	it("decodes every projected column into the row it declares", () => {
		const { ctx, internalCustomerId, feature } = seed();

		const [row] = customerEntitlementStore.listByInternalCustomerIdForFeatures({
			ctx,
			internalCustomerId,
			features: [feature],
		});

		expect(row).toEqual({
			id: "ce_cus_1_0",
			internal_customer_id: "icus_cus_1",
			internal_entity_id: null,
			internal_feature_id: "fi_messages",
			feature_id: "messages",
			customer_product_id: "cusprod_cus_1",
			entitlement_id: "ent_cus_1_0",
			created_at: 1_600_000_000_000,
			unlimited: false,
			balance: 12.5,
			additional_balance: 0,
			adjustment: 0,
			usage_allowed: true,
			separate_interval: false,
			is_pooled_balance: false,
			next_reset_at: null,
			expires_at: 1_800_000_000_000,
			external_id: null,
			cache_version: 0,
			entitlement: {
				id: "ent_cus_1_0",
				created_at: 1_600_000_000_000,
				internal_feature_id: "fi_messages",
				internal_product_id: "iprod_cus_1",
				is_custom: false,
				allowance_type: AllowanceType.Fixed,
				allowance: 100,
				interval: EntInterval.Month,
				interval_count: 1,
				entity_feature_id: null,
				pooled: false,
				feature_id: "messages",
				usage_limit: 200,
			},
		});
	});

	it("reads only the rows of the features it was asked for", () => {
		const { ctx, internalCustomerId, feature } = seed();

		const rows = customerEntitlementStore.listByInternalCustomerIdForFeatures({
			ctx,
			internalCustomerId,
			features: [feature],
		});

		expect(rows.map((row) => row.feature_id)).toEqual(["messages"]);
	});
});
