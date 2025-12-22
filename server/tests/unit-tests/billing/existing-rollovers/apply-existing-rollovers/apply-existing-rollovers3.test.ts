import { describe, expect, test } from "bun:test";
import type { ExistingRollover } from "@autumn/shared";
import { createMockCusEntitlement } from "@tests/utils/mockUtils/cusEntitlementMocks";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import chalk from "chalk";
import { applyExistingRollovers } from "@/internal/billing/billingUtils/handleExistingRollovers/applyExistingRollovers";

describe(chalk.yellowBright("applyExistingRollovers (multiple rollovers same feature)"), () => {
	test("applies multiple rollovers to the same feature", () => {
		const internalFeatureId = "internal_words";

		const cusEnt = createMockCusEntitlement({
			internalFeatureId,
			featureId: "words",
			featureName: "Words",
			allowance: 5000,
			balance: 5000,
		});

		const newCusProduct = createMockCustomerProduct({
			cusEntitlements: [cusEnt],
		});

		const existingRollovers: ExistingRollover[] = [
			{
				id: "rollover_1",
				cus_ent_id: "old_cus_ent_id",
				balance: 1000,
				usage: 0,
				expires_at: null,
				entities: {},
				internal_feature_id: internalFeatureId,
			},
			{
				id: "rollover_2",
				cus_ent_id: "old_cus_ent_id",
				balance: 500,
				usage: 0,
				expires_at: null,
				entities: {},
				internal_feature_id: internalFeatureId,
			},
		];

		// Act
		applyExistingRollovers({ newCusProduct, existingRollovers });

		// Assert: both rollovers should be added to the same cusEnt
		const updatedCusEnt = newCusProduct.customer_entitlements[0];
		expect(updatedCusEnt.rollovers.length).toBe(2);
		expect(updatedCusEnt.rollovers[0].balance).toBe(1000);
		expect(updatedCusEnt.rollovers[1].balance).toBe(500);
	});
});
