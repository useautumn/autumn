import { describe, expect, test } from "bun:test";
import type { ExistingRollover } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import { applyExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/applyExistingRollovers";

describe(
	chalk.yellowBright("applyExistingRollovers (no matching cusEnt)"),
	() => {
		test("skips rollover when no matching cusEnt exists", () => {
			const cusEnt = customerEntitlements.create({
				internalFeatureId: "internal_feature_a",
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 100,
			});

			const newCusProduct = customerProducts.create({
				customerEntitlements: [cusEnt],
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

			applyExistingRollovers({
				customerProduct: newCusProduct,
				existingRollovers,
			});

			const updatedCusEnt = newCusProduct.customer_entitlements[0];
			expect(updatedCusEnt.rollovers.length).toBe(0);
		});
	},
);
