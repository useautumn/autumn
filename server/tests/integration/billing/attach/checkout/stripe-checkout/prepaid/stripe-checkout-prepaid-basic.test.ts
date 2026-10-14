import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid 1: prepaid quantity")}`, async () => {
	const customerId = "stripe-checkout-prepaid-qty";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-prepaid-checkout",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});
	expect(preview.total).toBe(40);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 300,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 40,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid 2: prepaid quantity updated on checkout")}`, async () => {
	const customerId = "stripe-checkout-prepaid-qty-update";
	const includedUsage = 100;
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 20;

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
	});

	const pro = products.pro({
		id: "pro-prepaid-checkout-update",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const initialQuantity = 300;
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialQuantity,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	const checkoutTotalUnits = 500;
	const checkoutStripePacks = checkoutTotalUnits / billingUnits;
	const paidPacks = (checkoutTotalUnits - includedUsage) / billingUnits;
	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: checkoutStripePacks,
	});
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: checkoutTotalUnits,
		balance: checkoutTotalUnits,
		usage: 0,
	});

	const expectedTotal = basePrice + paidPacks * pricePerPack;
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid 3: prepaid quantity set to 0")}`, async () => {
	const customerId = "stripe-checkout-prepaid-qty-zero";
	const includedUsage = 0;
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 20;

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
	});

	const pro = products.pro({
		id: "pro-prepaid-checkout-zero",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const initialQuantity = 300;
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialQuantity,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();

	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 0,
		balance: 0,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
