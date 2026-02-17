import { describe, expect, test } from "bun:test";
import { type ExistingRollover, RolloverExpiryDurationType } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import { applyExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/applyExistingRollovers";

describe(
	chalk.yellowBright("applyExistingRollovers (duplicate internal_feature_id)"),
	() => {
		test("applies rollover only to first cusEnt when multiple have same internal_feature_id", () => {
			const internalFeatureId = "internal_words";

			const cusEntFirst = customerEntitlements.create({
				id: "cus_ent_first",
				internalFeatureId,
				featureId: "words",
				featureName: "Words",
				allowance: 100,
				balance: 100,
				rollover: { max: null, duration: RolloverExpiryDurationType.Month, length: 1 },
			});

			const cusEntSecond = customerEntitlements.create({
				id: "cus_ent_second",
				internalFeatureId,
				featureId: "words",
				featureName: "Words",
				allowance: 200,
				balance: 200,
				rollover: { max: null, duration: RolloverExpiryDurationType.Month, length: 1 },
			});

			const newCusProduct = customerProducts.create({
				customerEntitlements: [cusEntFirst, cusEntSecond],
			});

			const existingRollovers: ExistingRollover[] = [
				{
					id: "rollover_1",
					cus_ent_id: "old_cus_ent_id",
					balance: 50,
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

			// Assert: only the FIRST cusEnt gets the rollover (due to .find() behavior)
			const firstCusEnt = newCusProduct.customer_entitlements.find(
				(ce) => ce.id === "cus_ent_first",
			);
			const secondCusEnt = newCusProduct.customer_entitlements.find(
				(ce) => ce.id === "cus_ent_second",
			);

			expect(firstCusEnt?.rollovers.length).toBe(1);
			expect(firstCusEnt?.rollovers[0].balance).toBe(50);
			expect(secondCusEnt?.rollovers.length).toBe(0);
		});
	},
);
