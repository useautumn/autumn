/**
 * Custom Plan Error Tests (Attach V2)
 *
 * Tests for validation errors when using the `items` parameter in billing.attach.
 *
 * Key behaviors:
 * - Empty items array is rejected
 * - Same configuration as product is rejected (no change)
 * - Invalid feature ID is rejected
 * - Prepaid without quantity is rejected
 */

import { test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM PLAN ATTACH ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test 1: Empty items array is rejected
 *
 * Scenario:
 * - Attach with items: []
 *
 * Expected:
 * - Validation error: "Must provide at least one item when using custom plan"
 */
test.concurrent(`${chalk.yellowBright("error: attach custom plan empty items array")}`, async () => {
	const customerId = "err-custom-plan-empty-items";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				items: [], // Empty array
				redirect_mode: "if_required",
			});
		},
	});
});

/**
 * Test 2: Same configuration as product is rejected
 *
 * Scenario:
 * - Customer on Pro
 * - Attach same Pro with identical items
 *
 * Expected:
 * - Error: No changes to apply / already has product
 */
test.concurrent(`${chalk.yellowBright("error: attach custom plan same config as existing")}`, async () => {
	const customerId = "err-custom-plan-same-config";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Try to attach same product with same items
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				items: [messagesItem, priceItem], // Same as product
				redirect_mode: "if_required",
			});
		},
	});
});

/**
 * Test 3: Invalid feature ID is rejected
 *
 * Scenario:
 * - Attach with items referencing non-existent feature
 *
 * Expected:
 * - Error: Feature not found
 */
test.concurrent(`${chalk.yellowBright("error: attach custom plan invalid feature id")}`, async () => {
	const customerId = "err-custom-plan-invalid-feature";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.base({ id: "pro", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Create item with invalid feature ID
	const invalidFeatureItem = constructFeatureItem({
		featureId: "non_existent_feature_12345",
		includedUsage: 100,
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				items: [invalidFeatureItem],
				redirect_mode: "if_required",
			});
		},
	});
});

/**
 * Test 4: Prepaid without quantity is rejected
 *
 * Scenario:
 * - Attach with prepaid item but no options.quantity
 *
 * Expected:
 * - Error: Quantity required for prepaid items
 */
test.concurrent(`${chalk.yellowBright("error: attach custom plan prepaid without quantity")}`, async () => {
	const customerId = "err-custom-plan-prepaid-no-qty";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.base({ id: "pro", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Attach with prepaid item but no options
	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				items: [prepaidItem],
				// No options with quantity
				redirect_mode: "if_required",
			});
		},
	});
});
