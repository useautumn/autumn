import { describe, expect, test } from "bun:test";
import type { ExistingRollover } from "@autumn/shared";
import { createMockCusEntitlement } from "@tests/utils/mockUtils/cusEntitlementMocks";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import chalk from "chalk";
import { applyExistingRollovers } from "@/internal/billing/billingUtils/handleExistingRollovers/applyExistingRollovers";

describe(
	chalk.yellowBright(
		"applyExistingRollovers (zero balance, positive entity balance)",
	),
	() => {
		test("applies rollover when top-level balance is 0 but entity has positive balance", () => {
			const internalFeatureId = "internal_seats";

			const cusEnt = createMockCusEntitlement({
				internalFeatureId,
				featureId: "seats",
				featureName: "Seats",
				allowance: 10,
				balance: 10,
			});

			const newCusProduct = createMockCustomerProduct({
				customerEntitlements: [cusEnt],
			});

			const existingRollovers: ExistingRollover[] = [
				{
					id: "rollover_1",
					cus_ent_id: "old_cus_ent_id",
					balance: 0, // Top-level balance is 0
					usage: 0,
					expires_at: null,
					entities: {
						entity1: { id: "entity1", balance: 5, usage: 0 },
						entity2: { id: "entity2", balance: 3, usage: 0 },
					},
					internal_feature_id: internalFeatureId,
				},
			];

			// Act
			applyExistingRollovers({
				customerProduct: newCusProduct,
				existingRollovers,
			});

			// Assert: rollover SHOULD be applied because entity has balance > 0
			const updatedCusEnt = newCusProduct.customer_entitlements[0];
			expect(updatedCusEnt.rollovers.length).toBe(1);
			expect(updatedCusEnt.rollovers[0].balance).toBe(0);
			expect(updatedCusEnt.rollovers[0].entities.entity1.balance).toBe(5);
			expect(updatedCusEnt.rollovers[0].entities.entity2.balance).toBe(3);
		});
	},
);
