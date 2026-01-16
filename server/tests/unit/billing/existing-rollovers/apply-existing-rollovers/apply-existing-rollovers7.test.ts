import { describe, expect, test } from "bun:test";
import type { ExistingRollover } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import { applyExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/applyExistingRollovers";

describe(
	chalk.yellowBright(
		"applyExistingRollovers (zero balance, all-zero entity balances)",
	),
	() => {
		test("skips rollover when balance is 0 and all entity balances are 0", () => {
			const internalFeatureId = "internal_seats";

			const cusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "seats",
				featureName: "Seats",
				allowance: 10,
				balance: 10,
			});

			const newCusProduct = customerProducts.create({
				customerEntitlements: [cusEnt],
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
			applyExistingRollovers({
				customerProduct: newCusProduct,
				existingRollovers,
			});

			// Assert: rollover should NOT be applied (balance 0, all entity balances 0)
			const updatedCusEnt = newCusProduct.customer_entitlements[0];
			expect(updatedCusEnt.rollovers.length).toBe(0);
		});
	},
);
