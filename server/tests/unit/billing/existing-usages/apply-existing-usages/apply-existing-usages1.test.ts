import { describe, expect, test } from "bun:test";
import type { ExistingUsages } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";

const ctx = contexts.create({});

describe(chalk.yellowBright("applyExistingUsages"), () => {
	describe("basic usage deduction", () => {
		test("deducts existing usage from new entitlement balance", () => {
			const internalFeatureId = "internal_words";

			const cusEnt = customerEntitlements.create({
				internalFeatureId,
				featureId: "words",
				featureName: "Words",
				allowance: 5000,
				balance: 5000,
			});

			const cusProduct = customerProducts.create({
				customerEntitlements: [cusEnt],
			});

			const existingUsages: ExistingUsages = {
				[internalFeatureId]: { usage: 1500, entityUsages: {} },
			};

			applyExistingUsages({
				ctx,
				customerProduct: cusProduct,
				existingUsages,
				entities: [],
			});

			const updatedCusEnt = cusProduct.customer_entitlements.find(
				(ce) => ce.feature_id === "words",
			);
			expect(updatedCusEnt?.balance).toBe(3500);
		});
	});
});
