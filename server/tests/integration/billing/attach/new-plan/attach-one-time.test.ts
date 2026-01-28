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
	expectProductActive,
	expectProductNotPresent,
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
test.concurrent(`${chalk.yellowBright("new-plan: attach one-time purchase")}`, async () => {
	const customerId = "new-plan-attach-one-time";

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
		actions: [
			s.billing.attach({
				productId: oneOff.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: `${oneOff.id}_${customerId}`,
	});

	// Verify messages balance (100 from 1 pack)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	// Verify invoice: one-time charge ($10 base + $10 messages = $20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20, // oneOff base ($10) + prepaid ($10)
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
test.concurrent(`${chalk.yellowBright("new-plan: attach one-time purchase twice")}`, async () => {
	const customerId = "new-plan-attach-one-time-twice";

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
		actions: [
			s.billing.attach({
				productId: oneOff.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
	});

	// Attach same product again
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `${oneOff.id}_${customerId}`,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify messages balance is cumulative (200 = 100 + 100)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Verify two invoices created
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
test.concurrent(`${chalk.yellowBright("new-plan: attach pro then one-time as main")}`, async () => {
	const customerId = "new-plan-attach-pro-then-one-time-main";

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

	// Attach one-time without isAddOn - should replace pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `${oneOff.id}_${customerId}`,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		// Note: NOT setting is_add_on: true
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify pro is no longer present (replaced)
	await expectProductNotPresent({
		customer,
		productId: `${pro.id}_${customerId}`,
	});

	// Verify one-time is active
	await expectProductActive({
		customer,
		productId: `${oneOff.id}_${customerId}`,
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
test.concurrent(`${chalk.yellowBright("new-plan: attach one-time with quantity=0 for one feature")}`, async () => {
	const customerId = "new-plan-attach-one-time-qty0";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off-multi",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [
			s.billing.attach({
				productId: oneOff.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify messages added
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	// Verify invoice: only messages charged
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20, // base ($10) + messages ($10)
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
test.concurrent(`${chalk.yellowBright("new-plan: attach one-time as add-on to pro")}`, async () => {
	const customerId = "new-plan-attach-one-time-addon";

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
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Attach one-time add-on (is_add_on defined at product level, not in attach params)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `${oneOffAddon.id}_${customerId}`,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify both products are active
	await expectProductActive({
		customer,
		productId: `${pro.id}_${customerId}`,
	});
	await expectProductActive({
		customer,
		productId: `${oneOffAddon.id}_${customerId}`,
	});

	// Verify combined messages balance (100 from pro + 50 from one-off = 150)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 150,
		usage: 0,
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
test.concurrent(`${chalk.yellowBright("new-plan: attach one-time with multiple features")}`, async () => {
	const customerId = "new-plan-attach-one-time-multi-feat";

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
		actions: [
			s.billing.attach({
				productId: oneOff.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 2 }], // 2 packs = 200 messages
			}),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify messages balance (200 from 2 packs)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Verify invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 30, // base ($10) + 2 packs ($20)
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
test.concurrent(`${chalk.yellowBright("new-plan: attach one-time to entity")}`, async () => {
	const customerId = "new-plan-attach-one-time-entity";

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
		actions: [
			s.billing.attach({
				productId: oneOff.id,
				entityIndex: 0, // Attach to first entity
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
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

	// Customer should not have messages feature (it's on the entity)
	expect(customer.features[TestFeature.Messages]).toBeUndefined();
});
