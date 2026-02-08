import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: includedUsage must be a multiple of billingUnits (or 0)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create a prepaid product where includedUsage is NOT a multiple of billingUnits
 * - Attempt to initialize the product
 *
 * Why this fails:
 * - When creating Stripe tiered pricing, the first tier's `up_to` is calculated as:
 *   `includedUsage / billingUnits`
 * - If this results in a non-integer (e.g., 50 / 100 = 0.5), Stripe rejects it
 * - Stripe requires `up_to` to be a positive integer or "inf"
 *
 * Expected Result:
 * - Error thrown during product setup (when Stripe price creation fails)
 */
test.concurrent(`${chalk.yellowBright("error: prepaid includedUsage must be multiple of billingUnits")}`, async () => {
	const customerId = "prepaid-error-invalid-included-usage";
	const billingUnits = 100;

	// Invalid: 50 is NOT a multiple of 100
	const invalidPrepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		includedUsage: 50, // 50 / 100 = 0.5 → invalid for Stripe tiers
		billingUnits,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-invalid-prepaid",
		items: [invalidPrepaidItem],
	});

	// Error should be thrown during product setup (initScenario) when Stripe price creation fails
	await expect(
		initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		}),
	).rejects.toThrow();
});
