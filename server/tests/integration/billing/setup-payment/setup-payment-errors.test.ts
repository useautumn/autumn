/**
 * Setup Payment - Error Tests
 *
 * Tests for error cases in setup payment.
 * Errors are caught at the preview validation step, BEFORE creating
 * the Stripe checkout session (fail-fast pattern).
 *
 * Key behaviors:
 * - Invalid plan_id → error before checkout URL is created
 * - Duplicate product → error before checkout URL is created
 * - No Playwright needed — errors happen server-side
 */

import { test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Invalid plan_id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer exists
 * - Call setupPayment with a plan_id that doesn't exist
 *
 * Expected:
 * - Error thrown before checkout session is created (preview validation)
 */
test.concurrent(`${chalk.yellowBright("setup-payment error: invalid plan_id")}`, async () => {
	const customerId = "setup-pay-err-invalid-plan";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.setupPayment({
				customer_id: customerId,
				plan_id: "nonexistent-plan-id",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Customer already has the plan
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer already has pro product attached
 * - Call setupPayment with plan_id = pro
 *
 * Expected:
 * - Error thrown before checkout session is created (preview catches duplicate)
 */
test.concurrent(`${chalk.yellowBright("setup-payment error: customer already has plan")}`, async () => {
	const customerId = "setup-pay-err-duplicate-plan";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.setupPayment({
				customer_id: customerId,
				plan_id: pro.id,
			});
		},
	});
});
