import { expect, test } from "bun:test";
import type { ApiCusProductV3, ApiCustomerV3 } from "@shared/index";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION PRICING: Price changes between versions
// ═══════════════════════════════════════════════════════════════════════════════

// 1.1 Price increase: v1 $20 → v2 $30
test.concurrent(`${chalk.yellowBright("version-pricing: price increase")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-pricing-inc",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with higher price ($30)
	const newPriceItem = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, newPriceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $10 difference ($30 - $20)
	expect(preview.total).toBe(10);

	await autumnV1.subscriptions.update(updateParams);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 1.2 Price decrease: v1 $30 → v2 $20
test.concurrent(`${chalk.yellowBright("version-pricing: price decrease")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-pricing-dec",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with lower price ($20)
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

	// Should credit $10 difference ($20 - $30)
	expect(preview.total).toBe(-10);

	await autumnV1.subscriptions.update(updateParams);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 1.3 Price unchanged: v1 $20 → v2 $20 (only feature changes)
test.concurrent(`${chalk.yellowBright("version-pricing: price unchanged")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-pricing-unchanged",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with same price but different included usage
	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	await autumnV1.products.update(pro.id, {
		items: [newMessagesItem, priceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No price change
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 1.4 Add base price: v1 free → v2 $20
test.concurrent(`${chalk.yellowBright("version-pricing: add base price")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	// v1 has no base price (free)
	const pro = products.base({ id: "pro", items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-pricing-add",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with $20 base price
	const priceItem = items.monthlyPrice({ price: 20 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge full $20 (prorated from $0)
	expect(preview.total).toBe(20);

	await autumnV1.subscriptions.update(updateParams);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1, // Only version upgrade invoice (no initial for free)
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 1.5 Remove base price: v1 $20 → v2 free (subscription canceled, features remain)
test.concurrent(`${chalk.yellowBright("version-pricing: remove base price")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "version-pricing-remove",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with no base price (free)
	await autumnV1.products.update(pro.id, {
		items: [messagesItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should credit full $20 (prorated to $0)
	expect(preview.total).toBe(-20);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Customer should still have the feature (now free)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Product should still be active
	expect(
		customer.products.find((p: ApiCusProductV3) => p.id === pro.id),
	).toBeDefined();

	// Should have 2 invoices (initial charge + credit for downgrade)
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});

	// Verify product is active but has no subscription IDs (free product)
	const customerProduct = customer.products.find(
		(p: ApiCusProductV3) => p.id === pro.id,
	);
	expect(customerProduct).toBeDefined();
	expect(customerProduct?.stripe_subscription_ids?.length ?? 0).toBe(0);
});

// 1.6 Preview matches actual invoice
test.concurrent(`${chalk.yellowBright("version-pricing: preview matches invoice")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 25 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-pricing-preview-match",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with $45 price
	const newPriceItem = items.monthlyPrice({ price: 45 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, newPriceItem],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	};

	// Get preview first
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Execute update
	await autumnV1.subscriptions.update(updateParams);

	// Verify invoice matches preview exactly
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: preview.total,
	});

	// Also verify the expected amount ($45 - $25 = $20)
	expect(preview.total).toBe(20);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
