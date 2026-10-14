import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("one-off prepaid adjustable 1: flat-rate quantity override on checkout")}`, async () => {
	const customerId = "one-off-prepaid-adjustable-override";
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 10;

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const oneOffProduct = products.oneOff({
		id: "one-off-adjustable",
		items: [oneOffMessagesItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffProduct.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 300,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	const overridePacks = 5;
	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: overridePacks,
	});
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOffProduct.id,
	});

	const expectedUnits = overridePacks * billingUnits;
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: expectedUnits,
		balance: expectedUnits,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice + overridePacks * pricePerPack,
	});
});

test.concurrent(`${chalk.yellowBright("one-off prepaid adjustable 2: flat-rate adjustable false — no quantity selector")}`, async () => {
	const customerId = "one-off-prepaid-not-adjustable";
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 10;
	const quantity = 300;

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const oneOffProduct = products.oneOff({
		id: "one-off-not-adjustable",
		items: [oneOffMessagesItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffProduct.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity,
				adjustable: false,
			},
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOffProduct.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	const packs = quantity / billingUnits;
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice + packs * pricePerPack,
	});
});

test.concurrent(`${chalk.yellowBright("one-off prepaid adjustable 3: flat-rate adjustable true — no override, uses original quantity")}`, async () => {
	const customerId = "one-off-prepaid-adjustable-no-override";
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 10;
	const quantity = 300;

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const oneOffProduct = products.oneOff({
		id: "one-off-adj-no-override",
		items: [oneOffMessagesItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffProduct.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();

	await completeStripeCheckoutForm({ url: result.payment_url });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOffProduct.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	const packs = quantity / billingUnits;
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice + packs * pricePerPack,
	});
});

test.concurrent(`${chalk.yellowBright("one-off prepaid adjustable 4: tiered one-off — adjustable ignored (pre-computed price_data)")}`, async () => {
	const customerId = "one-off-prepaid-tiered-adjustable-ignored";
	const billingUnits = 100;
	const quantity = 300;

	const tieredOneOffItem = items.tieredOneOffMessages({
		includedUsage: 0,
		billingUnits,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf", amount: 5 },
		],
	});

	const oneOffProduct = products.oneOff({
		id: "one-off-tiered-adj",
		items: [tieredOneOffItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffProduct.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOffProduct.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	const basePrice = 10;
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice + 30,
	});
});

test.concurrent(`${chalk.yellowBright("one-off prepaid adjustable 5: multiple features — only messages adjustable, words fixed")}`, async () => {
	const customerId = "one-off-prepaid-multi-feature-adj";
	const billingUnits = 100;
	const pricePerPack = 10;

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const oneOffWordsItem = items.oneOffWords({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const oneOffProduct = products.base({
		id: "one-off-multi-adj",
		items: [oneOffMessagesItem, oneOffWordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [],
	});

	const messagesQuantity = 300;
	const wordsQuantity = 200;

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffProduct.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: messagesQuantity,
				adjustable: true,
			},
			{
				feature_id: TestFeature.Words,
				quantity: wordsQuantity,
				adjustable: false,
			},
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	const overridePacks = 5;
	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: overridePacks,
	});
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: oneOffProduct.id,
	});

	const expectedMessagesUnits = overridePacks * billingUnits;
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: expectedMessagesUnits,
		balance: expectedMessagesUnits,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: wordsQuantity,
		balance: wordsQuantity,
		usage: 0,
	});
});
