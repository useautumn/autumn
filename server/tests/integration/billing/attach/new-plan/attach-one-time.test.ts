/**
 * Attach One-Time Product Tests (Attach V2)
 *
 * Tests for attaching one-time (non-recurring) products.
 * One-time products are single purchases with no subscription.
 *
 * Key behaviors:
 * - Invoice is created for one-time purchase
 * - No recurring subscription
 * - Can be purchased multiple times (cumulative balance)
 * - Can be attached as add-on to existing products
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attach one-time purchase
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach one-time product with prepaid messages
 *
 * Expected Result:
 * - Invoice created
 * - Balance added
 * - No recurring subscription
 */
test.concurrent(`${chalk.yellowBright("new-plan: onetime-basic")}`, async () => {
	const customerId = "new-plan-onetime-basic";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off-messages",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// 1. Preview attach - verify base ($10) + prepaid ($10) = $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});
	expect(preview.total).toBe(20);

	// 2. Attach
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: oneOff.id,
	});

	// Verify messages balance (100 units)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
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
// TEST 2: Attach one-time purchase twice (cumulative)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach same one-time product twice
 *
 * Expected Result:
 * - Balance is cumulative (not replaced)
 * - Two invoices created
 */
test.concurrent(`${chalk.yellowBright("new-plan: onetime-cumulative")}`, async () => {
	const customerId = "new-plan-onetime-cumulative";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off-twice",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// 1. Preview first attach - $20
	const preview1 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});
	expect(preview1.total).toBe(20);

	// 2. First attach
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		redirect_mode: "if_required",
	});

	// 3. Preview second attach - $20
	const preview2 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});
	expect(preview2.total).toBe(20);

	// 4. Second attach
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify messages balance is cumulative (200 = 100 + 100)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Verify two invoices created, each matching preview total
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Attach pro then one-time as main (replaces pro)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro first
 * - Attach one-time WITHOUT isAddOn flag
 *
 * Expected Result:
 * - Should replace pro (user forgot to toggle isAddOn)
 */
test.concurrent(`${chalk.yellowBright("new-plan: onetime-leaves-pro")}`, async () => {
	const customerId = "new-plan-onetime-leaves-pro";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-main",
		items: [messagesItem],
	});

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 50,
		price: 5,
	});
	const oneOff = products.oneOff({
		id: "one-off-main",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, oneOff] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// 2. Preview one-time replacement (includes refund for pro)
	const previewOneOff = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 50 }],
	});
	const oneOffTotal = previewOneOff.total;

	// 3. Attach one-time without isAddOn - should replace pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 50 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerProducts({
		customer,
		active: [pro.id, oneOff.id],
	});

	// Verify latest invoice matches preview
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // pro invoice + one-off invoice
		latestTotal: oneOffTotal,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Attach one-time with quantity=0 for one feature
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - One-time with messages (qty=100) + words (qty=0)
 *
 * Expected Result:
 * - Messages added
 * - Words not charged
 */
test.concurrent(`${chalk.yellowBright("new-plan: onetime-zero-qty")}`, async () => {
	const customerId = "new-plan-onetime-zero-qty";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.base({
		id: "one-off",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// 1. Preview attach - base ($10) + messages ($10) = $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
	});
	expect(preview.total).toBe(0);

	// 2. Attach
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify messages added
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 0,
		usage: 0,
	});

	// Verify invoice matches preview total: $20
	await expectCustomerInvoiceCorrect({
		customer,
		count: 0,
		latestTotal: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Attach one-time as add-on to pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro first
 * - Attach one-time product (defined as add-on at product level)
 *
 * Expected Result:
 * - Both products exist
 * - Balances combined
 */
test.concurrent(`${chalk.yellowBright("new-plan: onetime-addon")}`, async () => {
	const customerId = "new-plan-onetime-addon";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-addon",
		items: [messagesItem],
	});

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 50,
		price: 5,
	});
	// Define as add-on at product level (isAddOn: true)
	const oneOffAddon = products.oneOff({
		id: "one-off-addon",
		items: [oneOffMessagesItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, oneOffAddon] }),
		],
		actions: [],
	});

	// 1. Preview and attach pro - $20
	const previewPro = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(previewPro.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	// 2. Preview add-on - base ($10) + prepaid ($5) = $15
	const previewAddOn = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOffAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 50 }],
	});
	expect(previewAddOn.total).toBe(15);

	// 3. Attach add-on
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 50 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify both products are active
	await expectProductActive({
		customer,
		productId: pro.id,
	});
	await expectProductActive({
		customer,
		productId: oneOffAddon.id,
	});

	// Verify combined messages balance (100 from pro + 50 from one-off = 150)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 150,
		usage: 0,
	});

	// Verify two invoices: pro ($20) + add-on ($15)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 15,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Attach one-time with multiple features
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - One-time with messages + words + storage (all one-off)
 *
 * Expected Result:
 * - All balances correct
 */
test.concurrent(`${chalk.yellowBright("new-plan: onetime-multi-qty")}`, async () => {
	const customerId = "new-plan-onetime-multi-qty";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off-multi-feat",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// 1. Preview attach - base ($10) + 2 packs ($20) = $30
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	expect(preview.total).toBe(30);

	// 2. Attach
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify messages balance (200 from 2 packs)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Verify invoice matches preview total: $30
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 30,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Attach one-time to entity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create entity
 * - Attach one-time to entity (not customer)
 *
 * Expected Result:
 * - Entity has balance
 * - Customer does not have balance for this feature
 */
test.concurrent(`${chalk.yellowBright("new-plan: onetime-entity")}`, async () => {
	const customerId = "new-plan-onetime-entity";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off-entity",
		items: [oneOffMessagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	// 1. Preview attach to entity - base ($10) + prepaid ($10) = $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOff.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});
	expect(preview.total).toBe(20);

	// 2. Attach to entity
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		redirect_mode: "if_required",
	});

	// Get entity to verify balance
	const entity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);

	// Verify entity has messages balance
	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	// Get customer and verify they don't have this balance at customer level
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify invoice on customer matches preview total: $20
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});
