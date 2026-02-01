/**
 * Attach Prepaid Product Tests (Attach V2)
 *
 * Tests for attaching products with prepaid features when customer has no existing product.
 *
 * Key behaviors:
 * - Prepaid quantities default to 0 when options not provided
 * - Options can explicitly set prepaid quantity to 0
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attach pro with prepaid features, no options (defaults to 0)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro product with prepaid messages + prepaid words without passing options
 *
 * Expected Result:
 * - Prepaid quantities default to 0
 * - Invoice = base price only ($20)
 * - Messages balance = 0, Words balance = 0
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach base with prepaid messages, no options")}`, async () => {
	const customerId = "new-plan-attach-base-prepaid-no-opts";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});

	const prepaidWords = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 50,
		billingUnits: 50,
		price: 5,
	});

	const pro = products.pro({
		id: "pro-prepaid-no-opts",
		items: [prepaidMessagesItem, prepaidWords],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Preview attach - verify base price only ($20), prepaid defaults to 0
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20);

	// 2. Attach without options - prepaid quantities default to 0
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify messages feature: prepaid defaults to 0, 100 included usage.
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	// Verify words feature: prepaid defaults to 0, 50 included usage.
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 50,
		usage: 0,
	});

	// Verify invoice: only base price ($20), no prepaid charges
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Attach pro with prepaid messages, quantity 0
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro product with prepaid messages, pass options with quantity: 0
 *
 * Expected Result:
 * - No prepaid charged, only base price ($20)
 * - Messages balance = 0
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach pro with prepaid messages, quantity 0")}`, async () => {
	const customerId = "new-plan-attach-pro-prepaid-qty0";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-prepaid-qty0",
		items: [prepaidMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Preview attach - verify only base price ($20), no prepaid
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
	});
	expect(preview.total).toBe(20);

	// 2. Attach
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify messages feature: 0 prepaid purchased
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 0,
		usage: 0,
	});

	// Verify invoice matches preview total: $20
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Attach base with prepaid messages, quantity 0
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach base product with prepaid messages, pass options with quantity: 0
 *
 * Expected Result:
 * - No prepaid charged, only base price ($10)
 * - Messages balance = 0
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach base with prepaid messages, quantity 0")}`, async () => {
	const customerId = "new-plan-attach-base-prepaid-qty0";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const base = products.base({
		id: "base-prepaid-qty0",
		items: [prepaidMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	// 1. Preview attach - verify only base price ($10), no prepaid
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: base.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
	});
	expect(preview.total).toBe(0);

	// 2. Attach with quantity 0
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: base.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: base.id,
	});

	// Verify messages feature: 0 prepaid purchased
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 0,
		usage: 0,
	});

	// Verify invoice matches preview total: $10
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});
});
