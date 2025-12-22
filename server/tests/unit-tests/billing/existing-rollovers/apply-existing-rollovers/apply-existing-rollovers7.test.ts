import { describe, expect, test } from "bun:test";
import type { ExistingRollover } from "@autumn/shared";
import { createMockCusEntitlement } from "@tests/utils/mockUtils/cusEntitlementMocks";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import chalk from "chalk";
import { applyExistingRollovers } from "@/internal/billing/billingUtils/handleExistingRollovers/applyExistingRollovers";

describe(chalk.yellowBright("applyExistingRollovers (zero balance, all-zero entity balances)"), () => {
	test("skips rollover when balance is 0 and all entity balances are 0", () => {
		const internalFeatureId = "internal_seats";

		const cusEnt = createMockCusEntitlement({
			internalFeatureId,
			featureId: "seats",
			featureName: "Seats",
			allowance: 10,
			balance: 10,
		});

		const newCusProduct = createMockCustomerProduct({
			cusEntitlements: [cusEnt],
		});

		const existingRollovers: ExistingRollover[] = [
			{
				id: "rollover_1",
				cus_ent_id: "old_cus_ent_id",
				balance: 0,
				usage: 10,
				expires_at: null,
				entities: {
					entity1: { id: "entity1", balance: 0, usage: 5 },
					entity2: { id: "entity2", balance: 0, usage: 5 },
				},
				internal_feature_id: internalFeatureId,
			},
		];

		// Act
		applyExistingRollovers({ newCusProduct, existingRollovers });

		// Assert: rollover should NOT be applied (balance 0, all entity balances 0)
		const updatedCusEnt = newCusProduct.customer_entitlements[0];
		expect(updatedCusEnt.rollovers.length).toBe(0);
	});
});
