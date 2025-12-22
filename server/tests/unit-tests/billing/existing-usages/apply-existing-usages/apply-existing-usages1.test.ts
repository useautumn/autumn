import { describe, expect, test } from "bun:test";
import type { ExistingUsages } from "@autumn/shared";
import { createMockCusEntitlement } from "@tests/utils/mockUtils/cusEntitlementMocks";
import { createMockCustomerProduct } from "@tests/utils/mockUtils/cusProductMocks";
import chalk from "chalk";
import { applyExistingUsages } from "@/internal/billing/billingUtils/handleExistingUsages/applyExistingUsages";

describe(chalk.yellowBright("applyExistingUsages"), () => {
	describe("basic usage deduction", () => {
		test("deducts existing usage from new entitlement balance", () => {
			const internalFeatureId = "internal_words";

			// Setup: Feature "words" with starting balance 5000, existing usage 1500
			const cusEnt = createMockCusEntitlement({
				internalFeatureId,
				featureId: "words",
				featureName: "Words",
				allowance: 5000, // Starting balance (no related price)
				balance: 5000, // Initial balance before applying existing usages
			});

			const cusProduct = createMockCustomerProduct({
				customerEntitlements: [cusEnt],
			});

			const existingUsages: ExistingUsages = {
				[internalFeatureId]: { usage: 1500, entityUsages: {} },
			};

			// Act
			applyExistingUsages({
				customerProduct: cusProduct,
				existingUsages,
				entities: [],
			});

			// Assert: balance should be 5000 - 1500 = 3500
			const updatedCusEnt = cusProduct.customer_entitlements.find(
				(ce) => ce.feature_id === "words",
			);
			expect(updatedCusEnt?.balance).toBe(3500);
		});
	});
});
