import { expect, test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

/**
 * Anchor Reset Refund -- No Carry Over
 *
 * When `billing_cycle_anchor: "now"` + `proration_behavior: "none"` WITHOUT carry_over_balances:
 * All refund items are stripped. Customer pays the full new plan amount with no credit.
 */

test.concurrent(`${chalk.yellowBright("anchor-reset-no-carry-over 1: monthly -> monthly (no refund)")}`, async () => {
	const customerId = "anchor-no-partial-m2m";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 14 }),
		],
	});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
	});
	expect(preview.total).toBe(50);

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice?.total).toBe(50);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 500,
		usage: 0,
		planId: premium.id,
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 50,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("anchor-reset-no-carry-over 2: monthly -> annual (no refund)")}`, async () => {
	const customerId = "anchor-no-partial-m2a";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premiumAnnual = products.base({
		id: "premium-annual",
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.annualPrice({ price: 500 }),
		],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premiumAnnual] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 14 }),
		],
	});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premiumAnnual.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
	});
	expect(preview.total).toBe(500);

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premiumAnnual.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice?.total).toBe(500);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premiumAnnual.id],
		notPresent: [pro.id],
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 500,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("anchor-reset-no-carry-over 3: annual -> monthly (no refund)")}`, async () => {
	const customerId = "anchor-no-carry-a2m";
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, premium] }),
		],
		actions: [
			s.billing.attach({ productId: proAnnual.id }),
			s.advanceTestClock({ months: 2, days: 15 }),
		],
	});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		plan_schedule: "immediate",
	});
	expect(preview.total).toBe(50);

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		plan_schedule: "immediate",
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice?.total).toBe(50);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [proAnnual.id],
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 50,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("anchor-reset-no-carry-over 4: annual -> annual (no refund)")}`, async () => {
	const customerId = "anchor-no-carry-a2a";
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premiumAnnual = products.base({
		id: "premium-annual",
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.annualPrice({ price: 500 }),
		],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, premiumAnnual] }),
		],
		actions: [
			s.billing.attach({ productId: proAnnual.id }),
			s.advanceTestClock({ months: 2, days: 15 }),
		],
	});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premiumAnnual.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
	});
	expect(preview.total).toBe(500);

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premiumAnnual.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice?.total).toBe(500);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premiumAnnual.id],
		notPresent: [proAnnual.id],
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 500,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
