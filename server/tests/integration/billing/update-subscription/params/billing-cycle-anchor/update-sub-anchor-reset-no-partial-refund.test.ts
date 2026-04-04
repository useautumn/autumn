import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { calculateResetBillingCycleNowTotal } from "@tests/integration/billing/utils/proration";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Update Subscription: Anchor Reset -- Refund vs No Partial Refund Tests
 *
 * "With refund" tests: `billing_cycle_anchor: "now"` (default proration) credits
 * the prorated remainder of the old plan, then charges the full new amount.
 *
 * "No partial refund" tests: `billing_cycle_anchor: "now"` + `billing_behavior: "none"`
 * strips refund items. The customer pays the full new amount with no credit.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// WITH REFUND (default proration)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-sub-anchor-refund 1: monthly -> monthly (with refund)")}`, async () => {
	const customerId = "update-sub-refund-m2m";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 14 }),
		],
	});

	const expectedTotal = await calculateResetBillingCycleNowTotal({
		customerId,
		advancedTo,
		oldAmount: 20,
		newAmount: 50,
	});

	const newPriceItem = items.monthlyPrice({ price: 50 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
		billing_cycle_anchor: "now" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("update-sub-anchor-refund 2: monthly -> monthly decrease (with refund)")}`, async () => {
	const customerId = "update-sub-refund-m2m-dec";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 50 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 14 }),
		],
	});

	const expectedTotal = await calculateResetBillingCycleNowTotal({
		customerId,
		advancedTo,
		oldAmount: 50,
		newAmount: 20,
	});

	const newPriceItem = items.monthlyPrice({ price: 20 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
		billing_cycle_anchor: "now" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NO PARTIAL REFUND (billing_behavior: "none")
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-sub-no-partial-refund 1: monthly -> monthly (no refund)")}`, async () => {
	const customerId = "update-sub-no-partial-m2m";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 14 }),
		],
	});

	const newPriceItem = items.monthlyPrice({ price: 50 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
		billing_cycle_anchor: "now" as const,
		billing_behavior: "none" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBe(50);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 50,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("update-sub-no-partial-refund 2: monthly -> annual (no refund)")}`, async () => {
	const customerId = "update-sub-no-partial-m2a";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 14 }),
		],
	});

	const annualPriceItem = items.annualPrice({ price: 200 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, annualPriceItem],
		billing_cycle_anchor: "now" as const,
		billing_behavior: "none" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBe(200);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 200,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("update-sub-no-partial-refund 3: annual -> monthly (no refund, no carry_over)")}`, async () => {
	const customerId = "update-sub-no-partial-a2m";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const annualPriceItem = items.annualPrice({ price: 200 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, annualPriceItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ months: 2, days: 15 }),
		],
	});

	const monthlyPriceItem = items.monthlyPrice({ price: 50 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, monthlyPriceItem],
		billing_cycle_anchor: "now" as const,
		billing_behavior: "none" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBe(50);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 50,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("update-sub-no-partial-refund 4: annual -> annual (no refund, no carry_over)")}`, async () => {
	const customerId = "update-sub-no-partial-a2a";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const annualPriceItem = items.annualPrice({ price: 200 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, annualPriceItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ months: 2, days: 15 }),
		],
	});

	const newAnnualPriceItem = items.annualPrice({ price: 500 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newAnnualPriceItem],
		billing_cycle_anchor: "now" as const,
		billing_behavior: "none" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBe(500);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 500,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
