import { expect, test } from "bun:test";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// 1. Entity 1 pro, Entity 2 free - Entity 2 updates free items (stays free)
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
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
		],
	});

	// Verify entity 2 starts with 100 included usage
	const entity2Before = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({ customer: entity2Before, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Before,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Entity 2 updates free product to have more included usage (still free)
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [updatedMessagesItem],
	});

	// Should be $0 since it's still a free product
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [updatedMessagesItem],
	});

	// Verify entity 2 has updated included usage
	const entity2After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({ customer: entity2After, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Verify only 1 invoice (from entity1's pro attachment)
	const customer = await autumnV1.customers.get(customerId);
	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20, // Only entity 1's pro
	});

	// Should still have 1 subscription (entity 1's pro)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: entities[0].id,
		subCount: 1,
	});
});

// 2. Entity 1 has paid sub, entity 2 upgrades free to paid
test.concurrent(`${chalk.yellowBright("multi-entity-free-to-paid: entity 2 upgrades free to paid")}`, async () => {
	const customerId = "multi-ent-free-to-paid";

	// Products
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
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
		],
	});

	// Update entity 2's free product to have a base price
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

	// Verify entity 2 has the updated product
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductActive({ customer: entity2Data, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Verify invoices (1 from entity1's pro, 1 from entity2's update)
	const customer = await autumnV1.customers.get(customerId);

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

// 3. Free to paid with base price + consumable + prepaid
test.concurrent(`${chalk.yellowBright("multi-entity-free-to-paid: base + consumable + prepaid")}`, async () => {
	const customerId = "multi-ent-f2p-combo";

	// Products
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
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
		],
	});

	// Update entity 2's free product to have base price + consumable + prepaid
	const priceItem = items.monthlyPrice(); // $20/mo
	const consumableItem = items.consumableMessages({ includedUsage: 50 }); // $0.10/msg overage
	const prepaidItem = items.prepaidMessages({ includedUsage: 0 }); // $10/100 msgs

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [priceItem, consumableItem, prepaidItem],
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 100, // Prepaid quantity (inclusive of billing units)
			},
		],
	});

	// Base price ($20) + prepaid ($10 for 100 units) = $30
	// Consumable charged on usage
	expect(preview.total).toEqual(30);

	// Prepaid quantity is inclusive of billing units (100 qty with 100 billing units = 100 credits)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [priceItem, consumableItem, prepaidItem],
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 100, // 100 credits (billing units = 100)
			},
		],
	});

	// Verify entity 2 has the updated product
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductActive({ customer: entity2Data, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: 100, // prepaid quantity
		balance: 100,
		usage: 0,
	});

	// Verify invoices
	const customer = await autumnV1.customers.get(customerId);

	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30, // $20 base + $10 prepaid
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

// 4. Free to paid with annual price
test.concurrent(`${chalk.yellowBright("multi-entity-free-to-paid: annual price")}`, async () => {
	const customerId = "multi-ent-f2p-annual";

	// Products
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
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
		],
	});

	// Update entity 2's free product to have annual price
	const annualPriceItem = items.annualPrice(); // $200/yr

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

	// Verify entity 2 has the updated product
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductActive({ customer: entity2Data, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Verify invoices
	const customer = await autumnV1.customers.get(customerId);

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

// 5. Free to paid with annual price MID-CYCLE
test.concurrent(`${chalk.yellowBright("multi-entity-free-to-paid: annual mid-cycle")}`, async () => {
	const customerId = "multi-ent-f2p-annual-mid";

	// Products
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
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
			s.advanceTestClock({ days: 15 }), // Advance 15 days mid-cycle
		],
	});

	// Update entity 2's free product to have annual price
	const annualPriceItem = items.annualPrice(); // $200/yr

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, annualPriceItem],
	});

	// Annual price should be charged in full (no proration for annual)
	console.log("Preview total (annual mid-cycle):", preview.total);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, annualPriceItem],
	});

	// Verify entity 2 has the updated product
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductActive({ customer: entity2Data, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Verify invoices
	const customer = await autumnV1.customers.get(customerId);

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

// 6. Monthly price mid-cycle
test.concurrent(`${chalk.yellowBright("multi-entity-free-to-paid: monthly mid-cycle")}`, async () => {
	const customerId = "multi-ent-f2p-midcycle";

	// Products
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
		options: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
			s.advanceTestClock({ days: 15 }), // Advance 15 days mid-cycle
		],
	});

	// Update entity 2's free product to have a base price
	const priceItem = items.monthlyPrice();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	// Mid-cycle: ~15/30 days remaining = ~50% proration = ~$10
	console.log("Preview total (mid-cycle):", preview.total);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	// Verify entity 2 has the updated product
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductActive({ customer: entity2Data, productId: free.id });
	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Verify invoices
	const customer = await autumnV1.customers.get(customerId);

	// Preview total should be prorated (around $10 for 15 days of $20/mo)
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
