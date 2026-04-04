import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { calculateResetBillingCycleNowTotal } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

/**
 * Update Subscription — Billing Cycle Anchor Reset + Custom Plan Changes
 *
 * Tests combining `billing_cycle_anchor: "now"` with `customize` (UpdatePlan intent).
 */

test.concurrent(`${chalk.yellowBright("update-sub anchor+custom 1: increase base price + anchor reset")}`, async () => {
	const customerId = "update-sub-anchor-custom-inc";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
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
		newAmount: 30,
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 30 }),
		},
		billing_cycle_anchor: "now",
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		params,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("update-sub anchor+custom 2: decrease base price + anchor reset")}`, async () => {
	const customerId = "update-sub-anchor-custom-dec";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
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
		oldAmount: 30,
		newAmount: 20,
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
		},
		billing_cycle_anchor: "now",
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		params,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("update-sub anchor+custom 3: add prepaid feature + anchor reset")}`, async () => {
	const customerId = "update-sub-anchor-custom-add-prepaid";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
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
		newAmount: 20,
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.prepaidWords({ amount: 10, billingUnits: 100 }),
			],
			price: itemsV2.monthlyPrice({ amount: 20 }),
		},
		billing_cycle_anchor: "now",
	};

	const preview =
		await autumnV2_2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		params,
	);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
