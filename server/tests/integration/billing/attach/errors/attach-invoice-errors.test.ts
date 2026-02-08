/**
 * Attach Invoice Mode Error Tests
 *
 * Tests for validation errors when using invoice mode with incompatible configurations.
 *
 * Key behaviors:
 * - Invoice mode with deferred activation (enable_product_immediately=false) cannot be used for downgrades
 */

import { test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE MODE ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test 1: Invoice mode deferred + downgrade is rejected
 *
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro ($20/mo) with invoice mode (deferred)
 *
 * Expected:
 * - Error: Cannot use invoice mode with deferred activation for downgrades
 *
 * Reason:
 * Downgrades are scheduled for end of cycle (planTiming="end_of_cycle") and
 * there is no immediate invoice to pay. Deferred activation (waiting for payment)
 * makes no sense in this context.
 */
test.concurrent(`${chalk.yellowBright("error: invoice mode deferred downgrade rejected")}`, async () => {
	const customerId = "err-inv-deferred-downgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: "premium" })],
	});

	// After initScenario, pro.id and premium.id are mutated to include the prefix

	// Try to downgrade with invoice mode deferred - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				invoice: true,
				finalize_invoice: true,
				enable_product_immediately: false, // Deferred - NOT allowed for downgrades
				redirect_mode: "if_required",
			});
		},
		errMessage:
			"Cannot use invoice mode with deferred activation for downgrades",
	});
});

/**
 * Test 2: Invoice mode deferred + downgrade (draft invoice) is also rejected
 *
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro ($20/mo) with invoice mode (draft, deferred)
 *
 * Expected:
 * - Error: Cannot use invoice mode with deferred activation for downgrades
 *
 * Same as test 1 but with finalize_invoice=false
 */
test.concurrent(`${chalk.yellowBright("error: invoice mode draft deferred downgrade rejected")}`, async () => {
	const customerId = "err-inv-draft-deferred-downgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: "premium" })],
	});

	// After initScenario, pro.id and premium.id are mutated to include the prefix

	// Try to downgrade with invoice mode draft + deferred - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				invoice: true,
				finalize_invoice: false, // Draft invoice
				enable_product_immediately: false, // Deferred - NOT allowed for downgrades
				redirect_mode: "if_required",
			});
		},
		errMessage:
			"Cannot use invoice mode with deferred activation for downgrades",
	});
});

/**
 * Test 3: Invoice mode immediate + downgrade is allowed (control test)
 *
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro ($20/mo) with invoice mode (immediate)
 *
 * Expected:
 * - No error - immediate activation is fine for downgrades
 * - Premium should be canceling, pro should be scheduled
 */
test.concurrent(`${chalk.yellowBright("control: invoice mode immediate downgrade allowed")}`, async () => {
	const customerId = "ctrl-inv-immediate-downgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: "premium" })],
	});

	// After initScenario, pro.id and premium.id are mutated to include the prefix

	// Downgrade with invoice mode immediate - should work
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: true, // Immediate - allowed for downgrades
		redirect_mode: "if_required",
	});

	// Should succeed - no error thrown
	// For downgrades, invoice/payment_url are not returned (no immediate charge)
	// This is tested in the main invoice tests
});
