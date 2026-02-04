/**
 * Scheduled Switch Error Tests (Attach V2)
 *
 * Tests for error conditions when attempting scheduled switches (downgrades).
 *
 * Key behaviors:
 * - Scheduled switch to products with mixed recurring + one-off prices is NOT supported
 */

import { test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Scheduled switch to mixed recurring + one-off product should fail
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Attempt downgrade to pro with mixed recurring + one-off prices ($20/mo + one-off messages)
 *
 * Expected Result:
 * - Error thrown: scheduled switch to mixed products not supported
 *
 * Why:
 * - Scheduled switches to products with both recurring and one-off prices aren't supported yet
 * - One-off items need to be purchased immediately, which conflicts with scheduled activation
 */
test.concurrent(`${chalk.yellowBright("error: scheduled switch to product with mixed recurring + one-off")}`, async () => {
	const customerId = "sched-switch-error-mixed-oneoff";

	// Premium: $50/mo, higher tier
	const premium = products.base({
		id: "premium",
		items: [
			items.monthlyPrice({ price: 50 }),
			items.monthlyMessages({ includedUsage: 1000 }),
		],
	});

	// Pro with mixed: $20/mo + one-off messages (lower base price = downgrade)
	const proMixed = products.base({
		id: "pro-mixed",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 500 }),
			items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, proMixed] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// Attempt scheduled downgrade to mixed product - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: proMixed.id,
			});
		},
	});
});
