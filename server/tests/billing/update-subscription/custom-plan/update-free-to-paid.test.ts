import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// FREE-TO-PAID TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Adding a monthly base price to free product
test.concurrent(`${chalk.yellowBright("free-to-paid: add monthly base price")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 300 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-add-base",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		},
		{ timeout: 2000 },
	);

	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $20 for monthly base price
	expect(preview.total).toEqual(20);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - 100,
		usage: 100,
	});

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
	});
});

// 2. Adding monthly base price + consumable to free product
test.concurrent(`${chalk.yellowBright("free-to-paid: add monthly base + consumable")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-add-base-cons",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	// Track some usage before update
	const messagesUsage = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const priceItem = items.monthlyPrice();
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [consumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $20 for monthly base price (consumable overage not charged on update)
	expect(preview.total).toEqual(20);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

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
	});
});

// 3. Adding annual base price + monthly consumable to free product
test.concurrent(`${chalk.yellowBright("free-to-paid: add annual base + monthly consumable")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-add-annual-cons",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	const priceItem = items.annualPrice();
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [consumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $200 for annual base price
	expect(preview.total).toEqual(200);

	await autumnV1.subscriptions.update(updateParams, { timeout: 2000 });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage,
		usage: 0,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 200,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4. Updating free feature item to consumable
test.concurrent(`${chalk.yellowBright("free-to-paid: update free item to consumable")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-update-to-cons",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	// Track some usage first
	const messagesUsage = 50;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Update to consumable (pay-per-use after included usage)
	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [consumableItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No immediate charge - consumable bills in arrears
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableItem.included_usage,
		balance: consumableItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	// No invoice - consumable bills in arrears, no immediate charge
	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 5. Updating free feature item to prepaid
test.concurrent(`${chalk.yellowBright("free-to-paid: update free item to prepaid")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-update-to-prepaid",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	// Track some usage first
	const messagesUsage = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Update to prepaid (purchase units upfront)
	const prepaidItem = items.prepaidMessages();

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [prepaidItem],
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Prepaid charges upfront - $10 for 100 units
	expect(preview.total).toEqual(10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100 - messagesUsage,
		usage: messagesUsage,
	});

	// Verify invoice matches preview
	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 6. Updating free users to allocated users
test.concurrent(`${chalk.yellowBright("free-to-paid: update free users to allocated")}`, async () => {
	const usersItem = items.monthlyUsers({ includedUsage: 5 });
	const free = products.base({ items: [usersItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-free-to-allocated",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	// Use some users (continuous use feature)
	const usersUsed = 3;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usersUsed,
		},
		{ timeout: 2000 },
	);

	// Verify initial state
	const initialCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(initialCustomer.features[TestFeature.Users].balance).toEqual(
		usersItem.included_usage - usersUsed,
	);

	// Update to allocated users ($10/seat prorated billing)
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 2 });

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [allocatedUsersItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge for (usersUsed - includedUsage) extra seats = (3 - 2) = 1 seat @ $10
	expect(preview.total).toEqual(10);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: allocatedUsersItem.included_usage,
		balance: allocatedUsersItem.included_usage - usersUsed,
		usage: usersUsed,
	});

	// Invoice for the extra seat
	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 10,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
