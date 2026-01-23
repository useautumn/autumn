import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Refund Behavior: Error Tests
 *
 * Tests that verify refund_behavior: 'refund_payment_method' is rejected
 * in scenarios where refunds cannot be issued:
 *
 * 1. Combined with billing_behavior: 'next_cycle_only' (incompatible)
 * 2. When invoice total is positive (no credit to refund)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// INCOMPATIBLE BEHAVIOR COMBINATIONS
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("refund_behavior error: refund_payment_method + next_cycle_only")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-err-incompatible",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Try to combine refund_payment_method with next_cycle_only - should fail
	const newPriceItem = items.monthlyPrice({ price: 20 });
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				items: [messagesItem, newPriceItem],
				billing_behavior: "next_cycle_only",
				refund_behavior: "refund_payment_method",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// POSITIVE INVOICE ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("refund_behavior error: refund_payment_method on upgrade (positive invoice)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-err-positive",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Try to request refund on an upgrade (positive invoice) - should fail
	const newPriceItem = items.monthlyPrice({ price: 30 }); // Upgrade from $20 to $30
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				items: [messagesItem, newPriceItem],
				refund_behavior: "refund_payment_method",
			});
		},
	});
});

test.skip(`${chalk.yellowBright("refund_behavior error: refund_payment_method on quantity increase (positive invoice)")}`, async () => {
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-err-qty-increase",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	// Try to request refund on quantity increase - should fail
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 10 }], // Increase from 5 to 10
				refund_behavior: "refund_payment_method",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// ZERO-CHANGE SCENARIO
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("refund_behavior error: refund_payment_method with zero invoice total")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-err-zero-total",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Update with same price (zero invoice total)
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				items: [messagesItem, priceItem], // Same items, no change
				refund_behavior: "refund_payment_method",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// FREE PRODUCT SCENARIO
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("refund_behavior error: refund_payment_method on free product (zero total)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const freeProduct = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-err-free-product",
		setup: [s.customer({}), s.products({ list: [freeProduct] })],
		actions: [s.attach({ productId: "free" })],
	});

	// Update free product - total is $0, can't request refund
	const reducedMessagesItem = items.monthlyMessages({ includedUsage: 50 });
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: freeProduct.id,
				items: [reducedMessagesItem],
				refund_behavior: "refund_payment_method",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALID COMBINATION: grant_invoice_credits + next_cycle_only
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("refund_behavior: grant_invoice_credits with next_cycle_only is allowed")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "rb-valid-credits-deferred",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// grant_invoice_credits + next_cycle_only should work
	// This combination is valid because grant_invoice_credits doesn't require immediate payment processing
	const newPriceItem = items.monthlyPrice({ price: 20 });
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
		billing_behavior: "next_cycle_only",
		refund_behavior: "grant_invoice_credits",
	});
});
