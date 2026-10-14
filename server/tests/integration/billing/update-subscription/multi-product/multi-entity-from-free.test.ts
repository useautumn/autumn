import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("multi-entity-from-free: update free items")}`, async () => {
	const customerId = "multi-ent-update-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
		],
	});

	const entity2Before = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({ customer: entity2Before, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Before,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [updatedMessagesItem],
	});

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [updatedMessagesItem],
	});

	const entity2After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({ customer: entity2After, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: entities[0].id,
		subCount: 1,
	});
});

test.concurrent(`${chalk.yellowBright("multi-entity-free-to-paid: entity 2 upgrades free to paid")}`, async () => {
	const customerId = "multi-ent-free-to-paid";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
		],
	});

	const priceItem = items.monthlyPrice();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	expect(preview.total).toEqual(20);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductActive({ customer: entity2Data, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: entities[1].id,
		subCount: 1,
	});
});

test.concurrent(`${chalk.yellowBright("multi-entity-free-to-paid: base + consumable + prepaid")}`, async () => {
	const customerId = "multi-ent-f2p-combo";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: "pro", entityIndex: 0 }),
			s.billing.attach({ productId: "free", entityIndex: 1 }),
		],
	});

	const priceItem = items.monthlyPrice();
	const consumableItem = items.consumableMessages({ includedUsage: 50 });
	const prepaidItem = items.prepaidMessages({ includedUsage: 0 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [priceItem, consumableItem, prepaidItem],
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 100,
			},
		],
	});

	expect(preview.total).toEqual(30);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [priceItem, consumableItem, prepaidItem],
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 100,
			},
		],
	});

	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductActive({ customer: entity2Data, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: 150,
		balance: 150,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
		options: { subCount: 1 },
	});
});

test.concurrent(`${chalk.yellowBright("multi-entity-free-to-paid: annual price")}`, async () => {
	const customerId = "multi-ent-f2p-annual";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
		],
	});

	const annualPriceItem = items.annualPrice();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, annualPriceItem],
	});

	expect(preview.total).toEqual(200);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, annualPriceItem],
	});

	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductActive({ customer: entity2Data, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 200,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: entities[1].id,
		subCount: 1,
	});
});

test.concurrent(`${chalk.yellowBright("multi-entity-free-to-paid: annual mid-cycle")}`, async () => {
	const customerId = "multi-ent-f2p-annual-mid";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	const annualPriceItem = items.annualPrice();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, annualPriceItem],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, annualPriceItem],
	});

	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductActive({ customer: entity2Data, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: entities[1].id,
		subCount: 1,
	});
});

test.concurrent(`${chalk.yellowBright("multi-entity-free-to-paid: monthly mid-cycle")}`, async () => {
	const customerId = "multi-ent-f2p-midcycle";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	const priceItem = items.monthlyPrice();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductActive({ customer: entity2Data, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: entities[1].id,
		subCount: 1,
	});
});
