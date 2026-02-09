import { test } from "bun:test";
import { ErrCode, FreeTrialDuration } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Billing Behavior: next_cycle_only Error Tests
 *
 * Tests that verify billing_behavior: 'next_cycle_only' is rejected
 * in scenarios where deferring charges is not allowed:
 *
 * 1. Free -> Paid transition (must charge for the paid plan)
 * 2. Removing a free trial (must charge for the full plan)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// FREE -> PAID TRANSITION ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("next_cycle_only error: free to paid upgrade")}`, async () => {
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 50 });
	const freeProduct = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	const paidMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const paidPriceItem = items.monthlyPrice({ price: 20 });
	const paidProduct = products.base({
		id: "paid",
		items: [paidMessagesItem, paidPriceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "bb-err-free-to-paid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProduct, paidProduct] }),
		],
		actions: [s.attach({ productId: "free" })],
	});

	// Try to upgrade from free to paid with next_cycle_only - should fail
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: freeProduct.id,
				items: [paidMessagesItem, paidPriceItem],
				billing_behavior: "next_cycle_only",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// REMOVING TRIAL ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("next_cycle_only error: removing free trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const proTrial = products.base({
		id: "pro-trial",
		items: [messagesItem, priceItem],
		trialDays: 14,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "bb-err-remove-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Try to remove trial with next_cycle_only - should fail
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: proTrial.id,
				free_trial: null,
				billing_behavior: "next_cycle_only",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALID CASES (should NOT error)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("next_cycle_only: paid to paid upgrade is allowed")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "bb-valid-p2p",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Paid to paid upgrade with next_cycle_only should work
	const newPriceItem = items.monthlyPrice({ price: 30 });
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
		billing_behavior: "next_cycle_only",
	});

	// If we get here without error, test passes
});

test.concurrent(`${chalk.yellowBright("next_cycle_only: extending trial is allowed")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const proTrial = products.base({
		id: "pro-trial",
		items: [messagesItem, priceItem],
		trialDays: 7,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "bb-valid-extend-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Extending trial with next_cycle_only should work (no charge needed)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
		},
		billing_behavior: "next_cycle_only",
	});

	// If we get here without error, test passes
});
