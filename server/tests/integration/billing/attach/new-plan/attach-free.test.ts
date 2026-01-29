/**
 * Attach Free Product Tests (Attach V2)
 *
 * Tests for attaching free products when customer has no existing product.
 * Free products have no base price and only provide included usage/features.
 *
 * Key behaviors:
 * - No invoice is created for free products
 * - Features are granted immediately
 * - Usage resets according to billing interval
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachPreview } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attach free product with monthly messages
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach free product with monthly messages (100 included)
 *
 * Expected Result:
 * - Product is active
 * - Messages feature has balance = 100, usage = 0
 * - No invoice created (free product)
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach free product")}`, async () => {
	const customerId = "new-plan-attach-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [],
	});

	// 1. Preview attach - verify no charge for free product
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
	});
	expect((preview as AttachPreview).due_today.total).toBe(0);

	// 2. Attach
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: free.id,
	});

	// Verify messages feature has correct balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify no invoice created (free product) - matches preview total of 0
	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Attach free product with multiple features
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach free product with: messages (100), words (200), dashboard (boolean)
 *
 * Expected Result:
 * - Product is active
 * - All features present with correct balances
 * - No invoice created (free product)
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach free with multiple features")}`, async () => {
	const customerId = "new-plan-attach-free-multi";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const dashboardItem = items.dashboard();

	const free = products.base({
		id: "free-multi",
		items: [messagesItem, wordsItem, dashboardItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [],
	});

	// 1. Preview attach - verify no charge for free product
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
	});
	expect((preview as AttachPreview).due_today.total).toBe(0);

	// 2. Attach
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: free.id,
	});

	// Verify messages feature
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify words feature
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Verify dashboard feature (boolean - just check it exists)
	expect(customer.features[TestFeature.Dashboard]).toBeDefined();

	// Verify no invoice created (free product) - matches preview total of 0
	expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});
