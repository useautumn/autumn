import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	ApiEntityV0,
	CustomerBillingControls,
} from "@autumn/shared";
import { BillingMethod } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProductCorrect } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectCustomerProductOptions } from "@tests/integration/utils/expectCustomerProductOptions";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";

const BILLING_UNITS = 100;
const PRICE_PER_UNIT = 10;

const INCLUDED_USAGE = 100;
const AUTO_TOPUP_WAIT_MS = 20000;
const VOLUME_TIERS = [
	{ to: 500, amount: 0, flat_amount: 0 },
	{ to: "inf" as const, amount: 0, flat_amount: 50 },
];

const makeAutoTopupConfig = ({
	threshold = 20,
	quantity = 100,
	enabled = true,
}: {
	threshold?: number;
	quantity?: number;
	enabled?: boolean;
} = {}): CustomerBillingControls => ({
	auto_topups: [
		{
			feature_id: TestFeature.Messages,
			enabled,
			threshold,
			quantity,
		},
	],
});

test.concurrent(`${chalk.yellowBright("attach: stripe checkout prepaid entities")}`, async () => {
	const customerId = "prepaid-ent-two-included";
	const quantity1 = 300;

	const prepaidItem = items.prepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const pro = products.base({
		id: "base-prepaid-ent-inc",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const params = {
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
		redirect_mode: "if_required",
	};

	const preview = await autumnV1.billing.previewAttach(params);
	expect(preview.total).toBe(20);

	// Attach to entity 1
	const res = await autumnV1.billing.attach(params);
	expect(res.payment_url).toBeDefined();
	expect(res.payment_url).toContain("checkout.stripe.com");

	// Complete checkout

	await completeStripeCheckoutFormV2({ url: res.payment_url });

	const customerAfter = await autumnV1.customers.get(customerId);
	await expectCustomerProductCorrect({
		customerId,
		customer: customerAfter,
		productId: pro.id,
		state: "active",
	});

	expectCustomerFeatureCorrect({
		customerId,
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: quantity1,
		balance: quantity1,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		customer: customerAfter,
		count: 1,
		latestTotal: 20,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});

test.concurrent(`${chalk.yellowBright("attach: stripe checkout monthly price with zero prepaid one-off")}`, async () => {
	const customerId = "stripe-checkout-monthly-oneoff-zero";
	const monthlyBasePrice = 20;
	const includedUsage = 100;
	const autoTopupQuantity = 100;
	const autoTopupThreshold = 20;
	const trackedUsage = 85;

	const monthlyPriceItem = items.monthlyPrice({ price: monthlyBasePrice });
	const monthlyMessagesItem = items.monthlyMessages({ includedUsage });
	const prepaidOneOffItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const product = products.base({
		id: "base-monthly-oneoff-zero",
		items: [monthlyPriceItem, monthlyMessagesItem, prepaidOneOffItem],
	});

	const { autumnV1, autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [product] })],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
		redirect_mode: "if_required",
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutFormV2({ url: result.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProductCorrect({
		customerId,
		customer,
		productId: product.id,
		state: "active",
	});

	expectCustomerFeatureCorrect({
		customerId,
		customer,
		featureId: TestFeature.Messages,
		includedUsage,
		balance: includedUsage,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		customer,
		count: 1,
		latestTotal: monthlyBasePrice,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});

	await autumnV2_1.customers.update(customerId, {
		billing_controls: makeAutoTopupConfig({
			threshold: autoTopupThreshold,
			quantity: autoTopupQuantity,
		}),
	});

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: trackedUsage,
	});

	await timeout(AUTO_TOPUP_WAIT_MS);

	const customerAfterTopup =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	const expectedRemaining = new Decimal(includedUsage)
		.sub(trackedUsage)
		.add(autoTopupQuantity)
		.toNumber();

	expectBalanceCorrect({
		customer: customerAfterTopup,
		featureId: TestFeature.Messages,
		remaining: expectedRemaining,
		usage: trackedUsage,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: PRICE_PER_UNIT,
		latestStatus: "paid",
	});

	await expectCustomerProductOptions({
		ctx,
		customerId,
		productId: product.id,
		featureId: TestFeature.Messages,
		quantity: 1,
	});
});

test.concurrent(`${chalk.yellowBright("attach: stripe checkout monthly volume prepaid + consumable update from zero")}`, async () => {
	const customerId = "stripe-checkout-monthly-volume-zero-update";
	const monthlyBasePrice = 20;
	const consumableIncludedUsage = 100;
	const checkoutPrepaidQuantity = 600;
	const expectedPrepaidCharge = 50;

	const monthlyPriceItem = items.monthlyPrice({ price: monthlyBasePrice });
	const consumableMessagesItem = items.consumableMessages({
		includedUsage: consumableIncludedUsage,
	});
	const prepaidVolumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: 1,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "base-monthly-volume-zero-update",
		items: [monthlyPriceItem, consumableMessagesItem, prepaidVolumeItem],
	});

	const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [product] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: product.id,
		entity_id: entities[0].id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 0,
			},
		],
		redirect_mode: "if_required",
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutFormV2({
		url: result.payment_url,
	});
	await timeout(12000);

	const entity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);

	await expectCustomerProductCorrect({
		customerId,
		customer: entity,
		productId: product.id,
		state: "active",
	});

	expectCustomerFeatureCorrect({
		customerId,
		customer: entity,
		featureId: TestFeature.Messages,
		includedUsage: consumableIncludedUsage,
		balance: consumableIncludedUsage,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerInvoiceCorrect({
		customerId,
		customer,
		count: 1,
		latestTotal: monthlyBasePrice,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entityAfter.id,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: checkoutPrepaidQuantity,
			},
		],
		recalculate_balances: {
			enabled: true,
		},
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const customerAfterV2_2 =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	expectCustomerFeatureCorrect({
		customerId,
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: checkoutPrepaidQuantity + consumableIncludedUsage,
		balance: checkoutPrepaidQuantity + consumableIncludedUsage,
		usage: 0,
	});

	expectBalanceCorrect({
		customer: customerAfterV2_2,
		featureId: TestFeature.Messages,
		remaining: checkoutPrepaidQuantity + consumableIncludedUsage,
		usage: 0,
		breakdown: {
			[BillingMethod.UsageBased]: {
				included_grant: consumableIncludedUsage,
				remaining: consumableIncludedUsage,
				usage: 0,
			},
			[BillingMethod.Prepaid]: {
				prepaid_grant: checkoutPrepaidQuantity,
				remaining: checkoutPrepaidQuantity,
				usage: 0,
			},
		},
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		customer: customerAfter,
		count: 2,
		latestTotal: expectedPrepaidCharge,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});

test.concurrent(`${chalk.yellowBright("attach: stripe checkout annual price with monthly volume prepaid + consumable update from zero")}`, async () => {
	const customerId = "stripe-checkout-annual-volume-zero-update";
	const annualBasePrice = 200;
	const consumableIncludedUsage = 100;
	const checkoutPrepaidQuantity = 600;

	const annualPriceItem = items.annualPrice({ price: annualBasePrice });
	const consumableMessagesItem = items.consumableMessages({
		includedUsage: consumableIncludedUsage,
	});
	const prepaidVolumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: 1,
		tiers: VOLUME_TIERS,
	});

	const product = products.base({
		id: "base-annual-volume-zero-update",
		items: [annualPriceItem, consumableMessagesItem, prepaidVolumeItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [product] })],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 0,
				adjustable: true,
			},
		],
		redirect_mode: "if_required",
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutFormV2({
		url: result.payment_url,
	});
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProductCorrect({
		customerId,
		customer,
		productId: product.id,
		state: "active",
	});

	expectCustomerFeatureCorrect({
		customerId,
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableIncludedUsage,
		balance: consumableIncludedUsage,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		customer,
		count: 1,
		latestTotal: annualBasePrice,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});

test.concurrent(`${chalk.yellowBright("attach: stripe checkout prepaid volume entities")}`, async () => {
	const customerId = "prepaid-ent-two-volume";
	const quantity1 = 600;

	const prepaidItem = items.volumePrepaidMessages({
		includedUsage: 100,
		billingUnits: 1,
		tiers: [
			{ to: 500, amount: 0, flat_amount: 30 },
			{ to: "inf" as const, amount: 0, flat_amount: 50 },
		],
	});

	const pro = products.base({
		id: "base-prepaid-ent-vol",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const params = {
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
		redirect_mode: "if_required",
	};

	const preview = await autumnV1.billing.previewAttach(params);
	expect(preview.total).toBe(30); // flat amount

	// Attach to entity 1
	const res = await autumnV1.billing.attach(params);
	expect(res.payment_url).toBeDefined();
	expect(res.payment_url).toContain("checkout.stripe.com");

	// Complete checkout

	await completeStripeCheckoutFormV2({ url: res.payment_url });

	const customerAfter = await autumnV1.customers.get(customerId);
	await expectCustomerProductCorrect({
		customerId,
		customer: customerAfter,
		productId: pro.id,
		state: "active",
	});

	expectCustomerFeatureCorrect({
		customerId,
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: quantity1,
		balance: quantity1,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		customer: customerAfter,
		count: 1,
		latestTotal: 30, // flat amount
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});
