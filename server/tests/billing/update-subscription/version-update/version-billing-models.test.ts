import { expect, test } from "bun:test";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION BILLING MODELS: Different billing model transitions between versions
// ═══════════════════════════════════════════════════════════════════════════════

// 6.1 Add prepaid item in v2
test.concurrent(`${chalk.yellowBright("version-billing: add prepaid users")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Verify no users feature before
	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Users]).toBeUndefined();

	// Create v2 with prepaid users added
	const prepaidUsersItem = items.prepaidUsers({ includedUsage: 5 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItem, prepaidUsersItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Adding prepaid with included usage has no price impact
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Users should now be accessible with 5 included
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 5,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 6.2 Add consumable (pay-per-use) overage in v2
test.concurrent(`${chalk.yellowBright("version-billing: add consumable overage")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-consumable",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with consumable messages (pay-per-use after included)
	const consumableMessagesItem = items.consumableMessages({ includedUsage: 100 });
	await autumnV1.products.update(pro.id, {
		items: [consumableMessagesItem, priceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Switching to consumable has no upfront price impact
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Messages feature should still be accessible
	expect(customer.features[TestFeature.Messages]).toBeDefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 6.3 Add allocated (prorated) seats in v2
test.concurrent(`${chalk.yellowBright("version-billing: add allocated seats")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-allocated",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with allocated users (prorated billing)
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItem, allocatedUsersItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Adding allocated with included seats has no upfront price impact
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Users should now be accessible with 3 included
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 3,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 6.4 Change from metered to prepaid for same feature
test.concurrent(`${chalk.yellowBright("version-billing: metered to prepaid")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-to-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Verify messages is metered (limited) before update
	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Messages]).toBeDefined();

	// Create v2 with prepaid messages instead of metered
	const prepaidMessagesItem = items.prepaidMessages({ includedUsage: 50 });
	await autumnV1.products.update(pro.id, {
		items: [prepaidMessagesItem, priceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Messages should now have prepaid model with 50 included
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 6.5 Mixed billing models: v2 has multiple billing types
test.concurrent(`${chalk.yellowBright("version-billing: mixed billing models")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-mixed",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with mixed billing: prepaid users + consumable messages + higher base price
	const prepaidUsersItem = items.prepaidUsers({ includedUsage: 3 });
	const consumableMessagesItem = items.consumableMessages({ includedUsage: 100 });
	const newPriceItem = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [consumableMessagesItem, prepaidUsersItem, newPriceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $10 for price increase
	expect(preview.total).toBe(10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Messages should have consumable model
	expect(customer.features[TestFeature.Messages]).toBeDefined();

	// Users should have prepaid model with 3 included
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 3,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 6.6 Remove billing model: v2 removes prepaid, keeps metered
test.concurrent(`${chalk.yellowBright("version-billing: remove prepaid keep metered")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const prepaidUsersItem = items.prepaidUsers({ includedUsage: 5 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({ id: "pro", items: [messagesItem, prepaidUsersItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-billing-remove",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Users, quantity: 0 }],
			}),
		],
	});

	// Verify users feature exists before
	const customerBefore = await autumnV1.customers.get(customerId);
	expect(customerBefore.features[TestFeature.Users]).toBeDefined();

	// Create v2 without prepaid users (simpler plan)
	const newPriceItem = items.monthlyPrice({ price: 20 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, newPriceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should credit $10 for price decrease
	expect(preview.total).toBe(-10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get(customerId);

	// Messages should still be accessible
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Users should be removed
	expect(customer.features[TestFeature.Users]).toBeUndefined();

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
