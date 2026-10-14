import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("recurring-oneoff 1: attach with both items")}`, async () => {
	const customerId = "recurring-oneoff-attach-both";
	const basePrice = 20;
	const wordsPricePerPack = 15;
	const messagesPricePerPack = 10;
	const billingUnits = 100;

	const monthlyWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits,
		price: wordsPricePerPack,
	});

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: messagesPricePerPack,
	});

	const pro = products.pro({
		id: "pro-recurring-oneoff",
		items: [monthlyWordsItem, oneOffMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const wordsQuantity = 100;
	const messagesQuantity = 100;
	const expectedTotal = basePrice + wordsPricePerPack + messagesPricePerPack;
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: wordsQuantity },
			{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
		],
	});
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Words, quantity: wordsQuantity },
			{ feature_id: TestFeature.Messages, quantity: messagesQuantity },
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: wordsQuantity,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
		usage: 0,
	});

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

test.concurrent(`${chalk.yellowBright("recurring-oneoff 2: attach with only one-off qty")}`, async () => {
	const customerId = "recurring-oneoff-attach-oneoff-only";
	const basePrice = 20;
	const wordsPricePerPack = 15;
	const messagesPricePerPack = 10;
	const billingUnits = 100;

	const monthlyWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits,
		price: wordsPricePerPack,
	});

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits,
		price: messagesPricePerPack,
	});

	const pro = products.pro({
		id: "pro-recurring-oneoff",
		items: [monthlyWordsItem, oneOffMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const messagesQuantity = 100;
	const expectedTotal = basePrice + messagesPricePerPack;
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 0,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
		usage: 0,
	});

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

test.concurrent(`${chalk.yellowBright("recurring-oneoff 3: attach with tiered one-off inline price")}`, async () => {
	const customerId = "recurring-oneoff-tiered-inline";
	const basePrice = 20;
	const quantity = 800;
	const billingUnits = 100;
	const includedUsage = 100;
	const expectedOneOffTotal = 5 * 10 + 2 * 5;
	const expectedTotal = basePrice + expectedOneOffTotal;

	const tieredOneOffMessagesItem = items.tieredOneOffMessages({
		includedUsage,
		billingUnits,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf", amount: 5 },
		],
	});

	const product = products.pro({
		id: "pro-recurring-tiered-oneoff",
		items: [tieredOneOffMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: product.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

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

test.concurrent(`${chalk.yellowBright("recurring-oneoff 4: attach one off base price with consumable messages")}`, async () => {
	const customerId = "recurring-oneoff-attach-both-invoice-mode-false";
	const messagesPricePerPack = 10;

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 0,
		price: messagesPricePerPack,
	});

	const pro = products.oneOff({
		items: [consumableMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	console.log("Result:", result);
});
