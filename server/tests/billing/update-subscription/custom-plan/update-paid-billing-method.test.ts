import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: BILLING MODEL TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════════

// 4.1 Consumable to prepaid (with overage usage)
test.concurrent(`${chalk.yellowBright("p2p: consumable to prepaid with overage")}`, async () => {
	const consumableItem = items.consumableMessages({ includedUsage: 50 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [consumableItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-cons-to-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track usage into overage (80 used with 50 included = 30 overage @ $0.10)
	const messagesUsage = 80;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Verify customer is in overage
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toBe(-30);

	// Change to prepaid with 100 units
	const prepaidItem = items.prepaidMessages({ includedUsage: 0 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [prepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	};
	3;
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Preview should only include prepaid charge ($10 for 100 units), NOT overage
	expect(preview.total).toBe(10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage should be preserved - was 80, now has 100 prepaid = 20 remaining
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100 - messagesUsage, // 100 - 80 = 20
		usage: messagesUsage,
	});

	// Verify invoice count and that latest total matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial attach + upgrade
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4.2 Prepaid to consumable
test.concurrent(`${chalk.yellowBright("p2p: prepaid to consumable")}`, async () => {
	const prepaidItem = items.prepaidMessages({ includedUsage: 0 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [prepaidItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-prepaid-to-cons",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Track some usage (40 of 100 prepaid = 60 unused)
	const messagesUsage = 40;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Change to consumable
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [consumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should refund full prepaid amount (usage carried over to new plan)
	expect(preview.total).toBe(-10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage should be preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// Verify invoice count and that latest total matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial attach + downgrade
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4.3 Included to consumable with overage
test.concurrent(`${chalk.yellowBright("p2p: included to consumable with overage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-inc-to-cons",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track some usage
	const messagesUsage = 60;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Change to consumable with overage (50 included + $0.10/unit overage)
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [consumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Billing model change only - no immediate charge
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage preserved - now over the included amount
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage - messagesUsage, // Will be negative
		usage: messagesUsage,
	});

	// Verify invoice count and that latest total matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial attach + billing model change
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4.4 Consumable to included (remove overage)
test.concurrent(`${chalk.yellowBright("p2p: consumable to included (remove overage)")}`, async () => {
	const consumableItem = items.consumableMessages({ includedUsage: 50 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [consumableItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-cons-to-inc",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track some usage
	const messagesUsage = 35;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Change to pure included (no overage)
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Billing model change only - no immediate charge
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// Verify invoice count and that latest total matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial attach + billing model change
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4.5 Allocated to prepaid
test.concurrent(`${chalk.yellowBright("p2p: allocated to prepaid")}`, async () => {
	const allocatedItem = items.allocatedUsers({ includedUsage: 2 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [allocatedItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-alloc-to-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Track some usage (5 users, 2 included, 3 overage)
	const usersUsage = 5;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usersUsage,
		},
		{ timeout: 2000 },
	);

	// Change to prepaid model with 10 users
	const prepaidItem = items.prepaidUsers({ includedUsage: 0 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [prepaidItem, priceItem],
		options: [{ feature_id: TestFeature.Users, quantity: 10 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage preserved, now with prepaid model
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 10 - usersUsage,
		usage: usersUsage,
	});

	// Verify invoice count and that latest total matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3, // Initial attach + arrear settlement + prepaid charge
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4.6 Prepaid to allocated
test.concurrent(`${chalk.yellowBright("p2p: prepaid to allocated")}`, async () => {
	const prepaidItem = items.prepaidUsers({ includedUsage: 0 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [prepaidItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-prepaid-to-alloc",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Users, quantity: 10 }],
			}),
		],
	});

	// Track some usage
	const usersUsage = 6;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usersUsage,
		},
		{ timeout: 2000 },
	);

	// Change to allocated model with 3 included
	const allocatedItem = items.allocatedUsers({ includedUsage: 3 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [allocatedItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage preserved, now using 6 with 3 included = 3 overage @ $10 each
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: allocatedItem.included_usage,
		balance: allocatedItem.included_usage - usersUsage, // -3
		usage: usersUsage,
	});

	// Verify invoice count and that latest total matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial attach + billing model change
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4.7 Allocated with entity-based usage
test.concurrent(`${chalk.yellowBright("p2p: allocated with entity-based usage")}`, async () => {
	const allocatedItem = items.allocatedUsers({ includedUsage: 2 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [allocatedItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-alloc-entities",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Entity count = 3, included = 2, so 1 overage seat @ $10
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: allocatedItem.included_usage,
		balance: allocatedItem.included_usage - 3, // 2 - 3 = -1
		usage: 3,
	});

	// Increase included to cover all entities
	const newAllocatedItem = items.allocatedUsers({ includedUsage: 5 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	await autumnV1.subscriptions.update(updateParams);

	const updatedCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Now 3 entities with 5 included = 2 remaining
	expectCustomerFeatureCorrect({
		customer: updatedCustomer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedItem.included_usage,
		balance: newAllocatedItem.included_usage - 3, // 5 - 3 = 2
		usage: 3,
	});

	// Verify invoice count and that latest total matches preview
	await expectCustomerInvoiceCorrect({
		customer: updatedCustomer,
		count: 2, // Initial attach + billing model change
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
