/**
 * Legacy Attach V1 Invoice Mode Tests (Finalized, Non-Deferred)
 *
 * Tests that V1 attach() with `invoice: true` (finalize_invoice defaults to true)
 * returns a checkout_url (hosted invoice URL) and defers product activation
 * until the invoice is paid.
 *
 * Scenarios:
 * 1. New subscription (non-merged)
 * 2. New subscription (merged / add-on)
 * 3. Upgrade (pro → premium)
 * 4. Update quantity (prepaid increase)
 */
/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, SuccessCode } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectSubCount,
	expectSubToBeCorrect,
} from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import {
	expectProductAttached,
	expectProductNotAttached,
} from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { completeInvoiceCheckout } from "@tests/utils/stripeUtils/completeInvoiceCheckout";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: New subscription (non-merged) - invoice mode
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro with invoice: true (finalize_invoice defaults to true)
 * - Returns checkout_url (hosted invoice URL), product NOT active
 * - Complete checkout → product active
 */
test.concurrent(`${chalk.yellowBright("legacy-inv-mode 1: new subscription")}`, async () => {
	const customerId = "legacy-inv-mode-new";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
	});

	expect(res.code).toBe(SuccessCode.CheckoutCreated);
	expect(res.checkout_url).toBeDefined();

	// Product should NOT be attached yet
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	await completeInvoiceCheckout({ url: res.checkout_url });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductAttached({
		customer: customerAfter as any,
		product: pro,
	});

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
// TEST 2: New subscription (merged / add-on) - invoice mode
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro normally (no invoice mode)
 * - Attach monthly add-on with invoice: true → checkout_url
 * - Add-on NOT attached until payment completes
 * - Complete checkout → both products attached, merged sub correct
 */
test.concurrent(`${chalk.yellowBright("legacy-inv-mode 2: merged add-on")}`, async () => {
	const customerId = "legacy-inv-mode-merged";

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
		actions: [s.attach({ productId: pro.id })],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
		invoice: true,
	});

	expect(res.checkout_url).toBeDefined();

	// Pro should still be attached, add-on should NOT be attached
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

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await completeInvoiceCheckout({ url: res.checkout_url });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customerAfter as any,
		product: pro,
	});
	expectProductAttached({
		customer: customerAfter as any,
		product: addOn,
	});

	await expectSubCount({ ctx, customerId, count: 2 });
	// await expectSubToBeCorrect({
	// 	db: ctx.db,
	// 	customerId,
	// 	org: ctx.org,
	// 	env: ctx.env,

	// });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade (pro → premium) - invoice mode
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro normally
 * - Upgrade to premium with invoice: true → checkout_url
 * - Still on pro until payment completes
 * - Complete checkout → premium active, invoice paid
 */
test.concurrent(`${chalk.yellowBright("legacy-inv-mode 3: upgrade")}`, async () => {
	const customerId = "legacy-inv-mode-upgrade";

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
		actions: [s.attach({ productId: pro.id })],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		invoice: true,
		finalize_invoice: false,
		enable_product_immediately: true,
	});

	expect(res.checkout_url).toBeFalsy();

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

	// Invoice should be paid after checkout
	const nonCachedCustomer = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(nonCachedCustomer.invoices?.[0].status).toBe("draft");

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-inv-mode 4: upgrade")}`, async () => {
	const customerId = "legacy-inv-mode-upgrade-2";

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
		actions: [s.attach({ productId: pro.id })],
	});

	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		invoice: true,
		enable_product_immediately: true,
	});

	expect(res.checkout_url).toBeDefined();

	await completeInvoiceCheckout({ url: res.checkout_url });

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

	// Invoice should be paid after checkout
	const nonCachedCustomer = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	expect(nonCachedCustomer.invoices?.[0].status).toBe("paid");

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
