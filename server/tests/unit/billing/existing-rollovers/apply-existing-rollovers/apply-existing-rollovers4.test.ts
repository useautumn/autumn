import { describe, expect, test } from "bun:test";
import type { ExistingRollover } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import { applyExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/applyExistingRollovers";

describe(
	chalk.yellowBright("applyExistingRollovers (multiple cusEnts, one match)"),
	() => {
		test("applies rollover only to matching feature when multiple cusEnts exist", () => {
			const cusEntA = customerEntitlements.create({
				internalFeatureId: "internal_feature_a",
				featureId: "feature_a",
				featureName: "Feature A",
				allowance: 100,
				balance: 100,
			});

			const cusEntB = customerEntitlements.create({
				internalFeatureId: "internal_feature_b",
				featureId: "feature_b",
				featureName: "Feature B",
				allowance: 200,
				balance: 200,
			});

			const newCusProduct = customerProducts.create({
				customerEntitlements: [cusEntA, cusEntB],
			});

			const existingRollovers: ExistingRollover[] = [
				{
					id: "rollover_1",
					cus_ent_id: "old_cus_ent_id",
					balance: 50,
					usage: 0,
					expires_at: null,
					entities: {},
					internal_feature_id: "internal_feature_a",
				},
			];

			// Act
			applyExistingRollovers({
				customerProduct: newCusProduct,
				existingRollovers,
			});

			// Assert: only feature_a gets the rollover
			const updatedCusEntA = newCusProduct.customer_entitlements.find(
				(ce) => ce.feature_id === "feature_a",
			);
			const updatedCusEntB = newCusProduct.customer_entitlements.find(
				(ce) => ce.feature_id === "feature_b",
			);

			expect(updatedCusEntA?.rollovers.length).toBe(1);
			expect(updatedCusEntA?.rollovers[0].balance).toBe(50);
			expect(updatedCusEntB?.rollovers.length).toBe(0);
		});
	},
);
