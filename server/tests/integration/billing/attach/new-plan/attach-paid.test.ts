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
		actions: [],
	});

	// 1. Preview attach - verify base ($20) + prepaid ($10) = $30
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});
	expect(preview.total).toBe(30);

	// 2. Attach
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		redirect_mode: "if_required",
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

	// Verify invoice matches preview total: $30
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
		actions: [],
	});

	// 1. Preview attach - verify base price ($20) + 2 overage users ($10 each) = $40
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(40);

	// 2. Attach
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

	// Verify users feature: 3 included, 5 used, -2 balance (overage)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: -2,
		usage: 5,
	});

	// Verify invoices: initial ($20 matches preview) + overage (2 users @ $10 = $20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 40, // Overage invoice
	});
});
