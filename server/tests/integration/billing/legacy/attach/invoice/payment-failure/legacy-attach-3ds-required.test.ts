/**
 * Legacy Attach V1 Payment Failure Tests - 3DS Authentication Required
 *
 * Tests that V1 attach() returns checkout_url when payment method requires
 * 3DS authentication, and that completing confirmation resolves the flow.
 *
 * Scenarios:
 * 1. New subscription - auth PM from start
 * 2. Upgrade (pro → premium) - swap to auth PM
 * 3. Merged (add-on) - swap to auth PM
 * 4. Update quantity (prepaid increase) - swap to auth PM
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceConfirmation } from "@tests/utils/browserPool";
import {
	expectProductAttached,
	expectProductNotAttached,
} from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: New subscription - 3DS required from start
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has authenticate PM, attach pro
 * - Returns checkout_url
 * - Product NOT active until confirmation
 * - Complete confirmation → product active
 */
test.concurrent(`${chalk.yellowBright("legacy-3ds 1: new subscription")}`, async () => {
	const customerId = "legacy-3ds-new";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "authenticate" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(res.checkout_url).toBeDefined();

	// Product should NOT be active yet
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	await completeInvoiceConfirmation({ url: res.checkout_url });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({ customer: customerAfter as any, product: pro });

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade (pro → premium) - 3DS required
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro with success PM
 * - Swap to authenticate PM
 * - Upgrade to premium → checkout_url
 * - Still on pro until confirmation
 * - Complete confirmation → premium active
 */
test.concurrent(`${chalk.yellowBright("legacy-3ds 2: upgrade")}`, async () => {
	const customerId = "legacy-3ds-upgrade";

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
			s.attachPaymentMethod({ type: "authenticate" }),
		],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	expect(res.checkout_url).toBeDefined();

	// Should still have pro's balance
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customerBefore as any,
		product: pro,
	});

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await completeInvoiceConfirmation({ url: res.checkout_url });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customerAfter as any,
		product: premium,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Merged (add-on) - 3DS required on merge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro with success PM
 * - Swap to authenticate PM
 * - Attach monthly add-on → checkout_url
 * - Add-on NOT attached until confirmation
 * - Complete confirmation → both products attached, merged sub
 */
test.concurrent(`${chalk.yellowBright("legacy-3ds 3: merged add-on")}`, async () => {
	const customerId = "legacy-3ds-merged";

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
			s.attachPaymentMethod({ type: "authenticate" }),
		],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
	});

	expect(res.checkout_url).toBeDefined();

	// Pro still attached, add-on NOT attached
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customerBefore as any,
		product: pro,
	});
	expectProductNotAttached({
		customer: customerBefore as any,
		product: addOn,
	});

	await completeInvoiceConfirmation({ url: res.checkout_url });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customerAfter as any,
		product: pro,
	});
	expectProductAttached({
		customer: customerAfter as any,
		product: addOn,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Update quantity (prepaid increase) - 3DS required
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro with prepaid messages (quantity 300, V1 excludes allowance)
 * - Swap to authenticate PM
 * - Increase quantity to 500 → checkout_url
 * - Balance unchanged until confirmation
 * - Complete confirmation → balance updated
 */
test.concurrent(`${chalk.yellowBright("legacy-3ds 4: update quantity")}`, async () => {
	const customerId = "legacy-3ds-qty";

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
			s.attachPaymentMethod({ type: "authenticate" }),
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
	const updatedQuantityV1 = 500;

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: updatedQuantityV1,
			},
		],
	});

	expect(res.checkout_url).toBeDefined();

	// Balance should be unchanged
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalBalance,
		balance: initialTotalBalance,
		usage: 0,
	});

	await completeInvoiceConfirmation({ url: res.checkout_url });

	// After confirmation: new total = 100 (allowance) + 500 (prepaid) = 600
	const updatedTotalBalance = 100 + updatedQuantityV1; // 600

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: updatedTotalBalance,
		balance: updatedTotalBalance,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
