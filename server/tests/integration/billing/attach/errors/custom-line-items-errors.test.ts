/**
 * Custom Line Items Error Tests (Attach V2)
 *
 * Tests that custom_line_items is rejected in invalid scenarios:
 * 1. Creating a new subscription (free → paid)
 * 2. Scheduled switch / downgrade
 * 3. Removing a trial (Stripe-managed invoice)
 */

import { test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: custom_line_items on subscription create should fail
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product
 * - Attach pro ($20/mo) with custom_line_items
 *
 * Expected Result:
 * - Error: custom_line_items only valid for subscription updates
 *
 * Why:
 * - Creating a new subscription generates its own Stripe invoice.
 *   Custom line items can't override that.
 */
test.concurrent(`${chalk.yellowBright("error: custom_line_items on subscription create")}`, async () => {
	const customerId = "cli-err-create-sub";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				redirect_mode: "if_required",
				custom_line_items: [{ amount: 10, description: "Should not work" }],
			});
		},
		errMessage:
			"custom_line_items can only be used when updating an existing subscription",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: custom_line_items on downgrade (scheduled switch) should fail
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo)
 * - Downgrade to pro ($20/mo) with custom_line_items
 *
 * Expected Result:
 * - Error: custom_line_items only valid for subscription updates
 *
 * Why:
 * - Downgrades are scheduled for end of cycle. There is no immediate invoice
 *   to override with custom line items.
 */
test.concurrent(`${chalk.yellowBright("error: custom_line_items on downgrade (scheduled switch)")}`, async () => {
	const customerId = "cli-err-downgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
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
		actions: [s.billing.attach({ productId: premium.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				redirect_mode: "if_required",
				custom_line_items: [{ amount: -10, description: "Should not work" }],
			});
		},
		errMessage:
			"custom_line_items can only be used when updating an existing subscription",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: custom_line_items on trial removal should fail
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has proWithTrial (7-day trial, currently trialing)
 * - Upgrade to premium (no trial) with custom_line_items
 *
 * Expected Result:
 * - Error: custom_line_items cannot be used when creating Stripe-managed invoice
 *
 * Why:
 * - When a trial is removed (trialing → non-trialing), Stripe automatically
 *   generates an invoice. Custom line items can't override Stripe's invoice.
 */
test.concurrent(`${chalk.yellowBright("error: custom_line_items on trial removal")}`, async () => {
	const customerId = "cli-err-trial-removal";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premium] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: premium.id,
				redirect_mode: "if_required",
				custom_line_items: [{ amount: 50, description: "Should not work" }],
			});
		},
		errMessage:
			"custom_line_items cannot be used when the subscription update creates a Stripe-managed invoice",
	});
});
