/**
 * Attach Paid Product Tests (Attach V2)
 *
 * Tests for attaching paid products when customer has no existing product.
 * Paid products have base price and various feature types (consumable, prepaid, allocated).
 *
 * Key behaviors:
 * - Invoice is created for base price + prepaid items
 * - Prepaid features require options with quantity
 * - Allocated features track entity usage
 */

import { test } from "bun:test";
import { type ApiCustomerV3, ErrCode } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attach pro with mixed features
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach pro ($20/mo) with consumable words + prepaid messages + allocated users
 *
 * Expected Result:
 * - Invoice = base ($20) + prepaid (100 messages @ $10 = $10)
 * - All features correctly configured
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach pro with mixed features")}`, async () => {
	const customerId = "new-plan-attach-pro-mixed";

	const consumableWordsItem = items.consumableWords({ includedUsage: 50 });
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });

	const pro = products.pro({
		id: "pro-mixed",
		items: [consumableWordsItem, prepaidMessagesItem, allocatedUsersItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }], // 1 pack of 100
			}),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify consumable words feature (50 included, no prepaid)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	// Verify prepaid messages feature (100 from 1 pack)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	// Verify allocated users feature (3 included)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 3,
		usage: 0,
	});

	// Verify invoice: base ($20) + prepaid ($10) = $30
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 30,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Attach pro with allocated, create entities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro with allocated users (3 included)
 * - Create 5 user entities via track
 *
 * Expected Result:
 * - Users usage = 5
 * - Overage invoice created for 2 extra users
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach pro with allocated, create entities")}`, async () => {
	const customerId = "new-plan-attach-pro-allocated";

	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });

	const pro = products.pro({
		id: "pro-allocated",
		items: [allocatedUsersItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 5, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Track 5 users (creates overage of 2)
	for (let i = 0; i < 5; i++) {
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 1,
		});
	}

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify users feature: 3 included, 5 used, -2 balance (overage)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: -2,
		usage: 5,
	});

	// Verify invoices: initial ($20) + overage (2 users @ $10 = $20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20, // Overage invoice
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Attach base with prepaid messages, no options (error)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach base product with prepaid messages without passing options
 *
 * Expected Result:
 * - Error: "behavior undefined" (prepaid requires quantity)
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach base with prepaid messages, no options")}`, async () => {
	const customerId = "new-plan-attach-base-prepaid-no-opts";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const base = products.base({
		id: "base-prepaid",
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

	// Attempt to attach without options - should fail
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: base.id,
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Attach pro with prepaid messages, no options (error)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro product with prepaid messages without passing options
 *
 * Expected Result:
 * - Error: "behavior undefined" (prepaid requires quantity)
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach pro with prepaid messages, no options")}`, async () => {
	const customerId = "new-plan-attach-pro-prepaid-no-opts";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-prepaid",
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

	// Attempt to attach without options - should fail
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Attach pro with prepaid messages, quantity 0
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
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
			}),
		],
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

	// Verify invoice: only base price ($20), no prepaid
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});
