import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// ONE-OFF PRODUCT UPDATES
//
// These tests cover updates to one-off products (products with interval: null).
// One-off products are purchased once and do not have recurring charges.
//
// Test scenarios:
// - Updating included usage on one-off message features
// - One-off products with prepaid items
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// ONE-OFF PRODUCT WITH FREE MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

// Update included usage on one-off product with free messages
test.concurrent(`${chalk.yellowBright("one-off: update included usage on free messages")}`, async () => {
	const oldIncludedUsage = 100;
	const messagesItem = items.monthlyMessages({
		includedUsage: oldIncludedUsage,
	});
	const oneOffProduct = products.oneOff({
		items: [messagesItem],
		id: "one-off-free",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "one-off-update-included",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [s.attach({ productId: oneOffProduct.id, timeout: 3000 })],
	});

	// Track some usage
	const messagesUsed = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Update to increase included usage
	const newIncludedUsage = 200;
	const updatedMessagesItem = items.monthlyMessages({
		includedUsage: newIncludedUsage,
	});

	// Must include one-off price item to prevent transition to free product
	const oneOffPriceItem = constructPriceItem({ price: 10, interval: null });

	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProduct.id,
		items: [updatedMessagesItem, oneOffPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No charge for updating included usage on one-off product
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Updated included usage, usage preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: newIncludedUsage,
		balance: newIncludedUsage - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Only initial one-off invoice
		latestTotal: 10, // One-off product price
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// ONE-OFF PRODUCT WITH BOOLEAN FEATURES
// ═══════════════════════════════════════════════════════════════════════════════

// Add boolean feature to one-off product
test.concurrent(`${chalk.yellowBright("one-off: add boolean feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const oneOffProduct = products.oneOff({
		items: [messagesItem],
		id: "one-off-no-dashboard",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "one-off-add-boolean",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [s.attach({ productId: oneOffProduct.id })],
	});

	// Update to add dashboard boolean feature
	const dashboardItem = items.dashboard();
	const oneOffPriceItem = constructPriceItem({ price: 10, interval: null });

	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProduct.id,
		items: [messagesItem, dashboardItem, oneOffPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No charge for adding boolean feature
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify dashboard feature is now enabled
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Dashboard,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Only initial one-off invoice
		latestTotal: 10,
	});
});

// Remove boolean feature from one-off product
test.concurrent(`${chalk.yellowBright("one-off: remove boolean feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const dashboardItem = items.dashboard();
	const oneOffProduct = products.oneOff({
		items: [messagesItem, dashboardItem],
		id: "one-off-with-dashboard",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "one-off-remove-boolean",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [s.attach({ productId: oneOffProduct.id })],
	});

	// Update to remove dashboard boolean feature
	const oneOffPriceItem = constructPriceItem({ price: 10, interval: null });

	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProduct.id,
		items: [messagesItem, oneOffPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No charge for removing boolean feature
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify dashboard feature is removed
	expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Only initial one-off invoice
		latestTotal: 10,
	});
});

// Update prepaid item included usage on one-off product
test.concurrent(`${chalk.yellowBright("one-off: update prepaid item included usage")}`, async () => {
	const billingUnits = 100;
	const price = 10;
	const oldIncludedUsage = 50;
	const prepaidItem = items.oneOffMessages({
		includedUsage: oldIncludedUsage,
		billingUnits,
		price,
	});
	const oneOffProduct = products.base({
		items: [prepaidItem],
		id: "one-off-prepaid-included",
	});

	const quantity = 200; // 2 packs

	const { customerId, autumnV1 } = await initScenario({
		customerId: "one-off-prepaid-included",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [
			s.attach({
				productId: oneOffProduct.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
				timeout: 4000,
			}),
		],
	});

	// Track some usage
	const messagesUsed = 100;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Update included usage from 50 to 100 (same quantity)
	const newIncludedUsage = 100;
	const updatedPrepaidItem = items.oneOffMessages({
		includedUsage: newIncludedUsage,
		billingUnits,
		price,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProduct.id,
		items: [updatedPrepaidItem],
		options: [{ feature_id: TestFeature.Messages, quantity }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No charge for changing included usage (same packs)
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Total included = newIncludedUsage + quantity = 100 + 200 = 300
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: newIncludedUsage + quantity,
		balance: newIncludedUsage + quantity - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Only initial invoice (no new charge)
		latestTotal: (quantity / billingUnits) * price, // 2 packs for initial
	});
});
