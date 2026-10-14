import { expect, test } from "bun:test";
import { type ApiCustomerV3, InvoiceStatus } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

test.concurrent(`${chalk.yellowBright("invoice.created consumable: multiple decimal tracks accumulate → advance cycle")}`, async () => {
	const customerId = "inv-created-cons-multi-decimal";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 50.3 }),
			s.track({ featureId: TestFeature.Messages, value: 30.7 }),
			s.track({ featureId: TestFeature.Messages, value: 25.5 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const totalUsage = 50.3 + 30.7 + 25.5;
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: totalUsage }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(expectedOverage).toBe(0.7);

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + expectedOverage,
		latestInvoiceProductId: pro.id,
	});

	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

test.concurrent(`${chalk.yellowBright("invoice.created consumable: multiple features → different overages → advance cycle")}`, async () => {
	const customerId = "inv-created-cons-multi-feat";

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});
	const consumableWordsItem = items.consumableWords({ includedUsage: 50 });

	const pro = products.pro({
		id: "pro",
		items: [consumableMessagesItem, consumableWordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 200 }),
			s.track({ featureId: TestFeature.Words, value: 150 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const messagesOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	const wordsOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Words, value: 150 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(messagesOverage).toBe(10);
	expect(wordsOverage).toBe(5);

	const totalOverage = messagesOverage + wordsOverage;

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + totalOverage,
		latestInvoiceProductId: pro.id,
	});

	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
	expect(customerAfterAdvance.features[TestFeature.Words].balance).toBe(50);
});

test.concurrent(`${chalk.yellowBright("invoice.created consumable: invoice total is correct (after invoice.created)")}`, async () => {
	const customerId = "inv-created-cons-total-correct";

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});

	const pro = products.pro({
		id: "pro",
		items: [consumableMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 200 }),
			s.advanceTestClock({ months: 1 }),
		],
	});

	const messagesOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(messagesOverage).toBe(10);
	const totalOverage = messagesOverage;

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		with_autumn_id: true,
	});

	const invoices = await InvoiceService.list({
		db: ctx.db,
		internalCustomerId: customer.autumn_id!,
	});

	expect(invoices.length).toBe(2);
	expect(invoices[0].status).toBe(InvoiceStatus.Draft);
	expect(invoices[0].total).toBe(20 + totalOverage);
});
