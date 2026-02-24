/**
 * Attach Basic Error Tests
 *
 * Tests for basic validation errors during attach operations.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// DUPLICATE PRODUCT ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Test 1: Cannot attach the same product that customer already has
 *
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Try to attach pro again
 *
 * Expected:
 * - Error: Cannot attach same product
 */
test.concurrent(`${chalk.yellowBright("error: cannot attach same product already active")}`, async () => {
	const customerId = "err-attach-same-product";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Try to attach the same product again - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				redirect_mode: "if_required",
			});
		},
	});
});

/**
 * Test 2: Cannot re-attach product that is canceling (pro -> free -> pro)
 *
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Downgrade to free (pro becomes canceling)
 * - Try to attach pro again
 *
 * Expected:
 * - Error: Cannot attach same product (pro is still the current product, just canceling)
 */
test.concurrent(`${chalk.yellowBright("error: cannot re-attach canceling product (pro -> free -> pro)")}`, async () => {
	const customerId = "err-reattach-canceling-pro-free";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const freeMessagesItem = items.monthlyMessages({
		includedUsage: 10,
	});
	const free = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: free.id }), // Downgrade: pro becomes canceling
		],
	});

	// Try to attach pro again while it's canceling - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				redirect_mode: "if_required",
			});
		},
	});
});

/**
 * Test 3: Cannot re-attach product that is canceling (premium -> pro -> premium)
 *
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro ($20/mo) - premium becomes canceling
 * - Try to attach premium again
 *
 * Expected:
 * - Error: Cannot attach same product (premium is still the current product, just canceling)
 */
test.concurrent(`${chalk.yellowBright("error: cannot re-attach canceling product (premium -> pro -> premium)")}`, async () => {
	const customerId = "err-reattach-canceling-premium-pro";

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
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.billing.attach({ productId: pro.id }), // Downgrade: premium becomes canceling
		],
	});

	// Try to attach premium again while it's canceling - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: premium.id,
				redirect_mode: "if_required",
			});
		},
	});
});

/**
 * Test 4: Explicit merge is rejected when no paid recurring subscription exists
 *
 * Scenario:
 * - Customer has free main product only
 * - Attach paid recurring add-on with new_billing_subscription: false
 *
 * Expected:
 * - InvalidRequest error (no eligible paid recurring cycle to merge into)
 */
test.concurrent(`${chalk.yellowBright("error: explicit merge requires existing paid recurring cycle")}`, async () => {
	const customerId = "err-explicit-merge-no-paid-cycle";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 20 })],
	});

	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyWords({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, addon] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "no active paid recurring subscription",
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: addon.id,
				new_billing_subscription: false,
				redirect_mode: "if_required",
			});
		},
	});
});
