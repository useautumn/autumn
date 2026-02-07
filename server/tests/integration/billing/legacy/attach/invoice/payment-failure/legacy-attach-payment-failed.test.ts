/**
 * Legacy Attach V1 Payment Failure Tests - Payment Failed (Card Declined)
 *
 * Tests that V1 attach() returns checkout_url when payment method is declined.
 * These tests verify the failure state only — no recovery flow.
 *
 * Scenarios:
 * 1. New subscription - fail PM from start
 * 2. Upgrade (pro → premium) - swap to fail PM
 * 3. Merged (add-on) - swap to fail PM
 * 4. Update quantity (prepaid increase) - swap to fail PM
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import {
	expectProductAttached,
	expectProductNotAttached,
} from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: New subscription - payment failed from start
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has fail PM, attach pro
 * - Returns checkout_url
 * - Product NOT active (features undefined)
 */
test.concurrent(`${chalk.yellowBright("legacy-fail 1: new subscription")}`, async () => {
	const customerId = "legacy-fail-new";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ paymentMethod: "fail" }), s.products({ list: [pro] })],
		actions: [],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(res.checkout_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.features?.[TestFeature.Messages]).toBeUndefined();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade (pro → premium) - payment failed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro with success PM
 * - Swap to fail PM
 * - Upgrade to premium → checkout_url
 * - Still on pro with pro's balance
 */
test.concurrent(`${chalk.yellowBright("legacy-fail 2: upgrade")}`, async () => {
	const customerId = "legacy-fail-upgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({
		includedUsage: 500,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	expect(res.checkout_url).toBeDefined();

	// Should still have pro's balance (upgrade not applied)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({ customer: customer as any, product: pro });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Merged (add-on) - payment failed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro with success PM
 * - Swap to fail PM
 * - Attach monthly add-on → checkout_url
 * - Pro still attached, add-on NOT attached
 */
test.concurrent(`${chalk.yellowBright("legacy-fail 3: merged add-on")}`, async () => {
	const customerId = "legacy-fail-merged";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const addOnMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const addOnPriceItem = items.monthlyPrice({ price: 10 });
	const addOn = products.base({
		id: "monthly-addon",
		isAddOn: true,
		items: [addOnMessagesItem, addOnPriceItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
	});

	expect(res.checkout_url).toBeDefined();

	// Pro still attached, add-on NOT attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({ customer: customer as any, product: pro });
	expectProductNotAttached({ customer: customer as any, product: addOn });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Update quantity (prepaid increase) - payment failed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro with prepaid messages (quantity 300, V1 excludes allowance)
 * - Swap to fail PM
 * - Increase quantity to 500 → checkout_url
 * - Balance unchanged (still at original total)
 */
test.concurrent(`${chalk.yellowBright("legacy-fail 4: update quantity")}`, async () => {
	const customerId = "legacy-fail-qty";

	const prepaidItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
		},
	});
	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	// V1 quantity excludes allowance: 300 units = 3 packs
	const initialQuantityV1 = 300;
	const initialTotalBalance = 100 + initialQuantityV1; // 400

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialQuantityV1,
					},
				],
			}),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	// Verify initial state
	const customerInit = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerInit,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalBalance,
		balance: initialTotalBalance,
		usage: 0,
	});

	// Increase quantity to 500 (V1, excludes allowance)
	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
	});

	expect(res.checkout_url).toBeDefined();

	// Balance should be unchanged
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalBalance,
		balance: initialTotalBalance,
		usage: 0,
	});
});
