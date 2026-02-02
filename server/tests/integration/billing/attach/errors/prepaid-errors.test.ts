import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
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
 * - Attempt to attach the product
 *
 * Why this fails:
 * - When creating Stripe tiered pricing, the first tier's `up_to` is calculated as:
 *   `includedUsage / billingUnits`
 * - If this results in a non-integer (e.g., 50 / 100 = 0.5), Stripe rejects it
 * - Stripe requires `up_to` to be a positive integer or "inf"
 *
 * Expected Result:
 * - Error thrown during attach (when Stripe price creation fails)
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

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attempt to attach should fail due to invalid Stripe tier configuration
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Valid prepaid configurations (sanity check)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * These should all work:
 * - includedUsage: 0 (no free tier)
 * - includedUsage: 100 (exactly 1 billing unit)
 * - includedUsage: 200 (exactly 2 billing units)
 */
test.concurrent(`${chalk.yellowBright("prepaid: valid includedUsage multiples work correctly")}`, async () => {
	const customerId = "prepaid-valid-included-usage";
	const billingUnits = 100;

	// Valid: 0 is a valid multiple (no free tier)
	const validPrepaidZero = constructPrepaidItem({
		featureId: TestFeature.Messages,
		includedUsage: 0,
		billingUnits,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-valid-prepaid",
		items: [validPrepaidZero],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// This should succeed
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});

	expect(result.code).toBe("success");
});
