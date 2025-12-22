import { describe, expect, test } from "bun:test";
import type { ExistingRollover } from "@autumn/shared";
import { createMockCusEntitlement } from "@tests/utils/mockUtils/cusEntitlementMocks";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import chalk from "chalk";
import { applyExistingRollovers } from "@/internal/billing/billingUtils/handleExistingRollovers/applyExistingRollovers";

describe(chalk.yellowBright("applyExistingRollovers (no matching cusEnt)"), () => {
	test("skips rollover when no matching cusEnt exists", () => {
		const cusEnt = createMockCusEntitlement({
			internalFeatureId: "internal_feature_a",
			featureId: "feature_a",
			featureName: "Feature A",
			allowance: 100,
			balance: 100,
		});

		const newCusProduct = createMockCustomerProduct({
			cusEntitlements: [cusEnt],
		});

		const existingRollovers: ExistingRollover[] = [
			{
				id: "rollover_1",
				cus_ent_id: "old_cus_ent_id",
				balance: 500,
				usage: 0,
				expires_at: null,
				entities: {},
				internal_feature_id: "internal_nonexistent_feature",
			},
		];

		// Act
		applyExistingRollovers({ newCusProduct, existingRollovers });

		// Assert: no rollovers added since feature doesn't match
		const updatedCusEnt = newCusProduct.customer_entitlements[0];
		expect(updatedCusEnt.rollovers.length).toBe(0);
	});
});
