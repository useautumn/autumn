import { describe, expect, test } from "bun:test";
import type { ExistingRollover } from "@autumn/shared";
import { createMockCusEntitlement } from "@tests/utils/mockUtils/cusEntitlementMocks";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import chalk from "chalk";
import { applyExistingRollovers } from "@/internal/billing/billingUtils/handleExistingRollovers/applyExistingRollovers";

describe(chalk.yellowBright("applyExistingRollovers"), () => {
	describe("basic rollover application", () => {
		test("applies rollover with positive balance to matching cusEnt", () => {
			const internalFeatureId = "internal_words";

			const cusEnt = createMockCusEntitlement({
				internalFeatureId,
				featureId: "words",
				featureName: "Words",
				allowance: 5000,
				balance: 5000,
			});

			const newCusProduct = createMockCustomerProduct({
				customerEntitlements: [cusEnt],
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
			];

			// Act
			applyExistingRollovers({
				customerProduct: newCusProduct,
				existingRollovers,
			});

			// Assert: rollover should be added to the cusEnt
			const updatedCusEnt = newCusProduct.customer_entitlements.find(
				(ce) => ce.feature_id === "words",
			);
			expect(updatedCusEnt?.rollovers.length).toBe(1);
			expect(updatedCusEnt?.rollovers[0].balance).toBe(1000);
			expect(updatedCusEnt?.rollovers[0].cus_ent_id).toBe(updatedCusEnt?.id);
		});
	});
});
