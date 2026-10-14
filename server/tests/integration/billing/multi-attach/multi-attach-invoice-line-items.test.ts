import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("multi-attach-line-items 1: checkout - pro + recurring add-on")}`, async () => {
	const customerId = "ma-li-checkout-pro-addon";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const monthlyWords = items.monthlyWords({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro-ma-li",
		items: [prepaidMessages],
	});
	const addon = products.recurringAddOn({
		id: "addon-ma-li",
		items: [monthlyWords],
	});

	const messagesQuantity = 200;
	const proBasePrice = 20;
	const prepaidPrice = 10;
	const addonBasePrice = 20;
	const expectedTotal = proBasePrice + prepaidPrice + addonBasePrice;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewMultiAttach({
		customer_id: customerId,
		plans: [
			{
				plan_id: pro.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
				],
			},
			{ plan_id: addon.id },
		],
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	const result = await autumnV1.billing.multiAttach(
		{
			customer_id: customerId,
			plans: [
				{
					plan_id: pro.id,
					feature_quantities: [
						{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
					],
				},
				{ plan_id: addon.id },
			],
		},
		{ timeout: 0 },
	);

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, productId: pro.id, minCount: 1 },
			{ isBasePrice: true, productId: addon.id, minCount: 1 },
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice,
				billingTiming: "in_advance",
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("multi-attach-line-items 2: checkout - two products different groups")}`, async () => {
	const customerId = "ma-li-checkout-diff-groups";

	const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
	const allocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const planA = products.pro({
		id: "plan-a-li",
		items: [monthlyMessages],
	});
	const planB = products.base({
		id: "plan-b-li",
		items: [allocatedUsers, items.monthlyPrice({ price: 30 })],
		group: "group-b",
	});

	const planABasePrice = 20;
	const planBBasePrice = 30;
	const allocatedPrice = 20;
	const expectedTotal = planABasePrice + planBBasePrice + allocatedPrice;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [planA, planB] }),
			s.entities({ count: 5, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.multiAttach(
		{
			customer_id: customerId,
			plans: [{ plan_id: planA.id }, { plan_id: planB.id }],
		},
		{ timeout: 0 },
	);

	expect(result.payment_url).toBeDefined();

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [planA.id, planB.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		usage: 5,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, productId: planA.id, minCount: 1 },
			{ isBasePrice: true, productId: planB.id, minCount: 1 },
			{
				featureId: TestFeature.Users,
				totalAmount: allocatedPrice,
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("multi-attach-line-items 3: direct billing - pro + addon with prepaid")}`, async () => {
	const customerId = "ma-li-direct-prepaid";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const prepaidWords = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits: 100,
		price: 5,
	});

	const pro = products.pro({
		id: "pro-direct-li",
		items: [prepaidMessages],
	});
	const addon = products.recurringAddOn({
		id: "addon-direct-li",
		items: [prepaidWords],
	});

	const messagesQuantity = 300;
	const wordsQuantity = 200;
	const proBasePrice = 20;
	const msgPrepaidPrice = 20;
	const addonBasePrice = 20;
	const wordsPrepaidPrice = 10;
	const expectedTotal =
		proBasePrice + msgPrepaidPrice + addonBasePrice + wordsPrepaidPrice;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewMultiAttach({
		customer_id: customerId,
		plans: [
			{
				plan_id: pro.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
				],
			},
			{
				plan_id: addon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Words, quantity: wordsQuantity },
				],
			},
		],
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	const result = await autumnV1.billing.multiAttach({
		customer_id: customerId,
		plans: [
			{
				plan_id: pro.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
				],
			},
			{
				plan_id: addon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Words, quantity: wordsQuantity },
				],
			},
		],
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: wordsQuantity,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, productId: pro.id, minCount: 1 },
			{ isBasePrice: true, productId: addon.id, minCount: 1 },
			{
				featureId: TestFeature.Messages,
				totalAmount: msgPrepaidPrice,
				billingTiming: "in_advance",
			},
			{
				featureId: TestFeature.Words,
				totalAmount: wordsPrepaidPrice,
				billingTiming: "in_advance",
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("multi-attach-line-items 4: checkout - one-off addon + recurring")}`, async () => {
	const customerId = "ma-li-checkout-oneoff";

	const monthlyMessages = items.monthlyMessages({ includedUsage: 200 });
	const dashboardItem = items.dashboard();

	const pro = products.pro({
		id: "pro-oneoff-li",
		items: [monthlyMessages],
	});
	const oneOffAddon = products.oneOffAddOn({
		id: "oneoff-addon-li",
		items: [dashboardItem],
	});

	const proBasePrice = 20;
	const oneOffPrice = 10;
	const expectedTotal = proBasePrice + oneOffPrice;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro, oneOffAddon] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.multiAttach(
		{
			customer_id: customerId,
			plans: [{ plan_id: pro.id }, { plan_id: oneOffAddon.id }],
		},
		{ timeout: 0 },
	);

	expect(result.payment_url).toBeDefined();

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, oneOffAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, productId: pro.id, minCount: 1 },
			{ isBasePrice: true, productId: oneOffAddon.id, minCount: 1 },
		],
	});
});
