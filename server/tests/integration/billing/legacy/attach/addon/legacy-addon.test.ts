/**
 * Legacy Add-on Attach Tests
 *
 * Migrated from:
 * - server/tests/attach/addOn/addOn1.test.ts (attach pro then free add-on)
 * - server/tests/attach/addOn/addOn2.test.ts (attach pro then free add-on with credits)
 * - server/tests/attach/basic/basic2.test.ts (attach pro then monthly prepaid add-on with quantity)
 *
 * Tests V1 attach (s.attach) behavior for:
 * - Attaching a free add-on after a base product
 * - Verifying both products appear as active
 * - Verifying feature balances after add-on attachment
 * - Attaching prepaid add-ons with quantity options
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV1, ApiCustomerV3 } from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attach pro then free add-on with messages
// (from addOn1)
//
// Scenario:
// - Pro product ($20/month) with Messages feature (100 included)
// - Free add-on with Messages feature (200 included)
// - Attach Pro, then attach add-on
//
// Expected:
// - Customer has both Pro and add-on active
// - 1 invoice for $20 (Pro subscription only, add-on is free)
// - Messages balance = 100 (Pro) + 200 (add-on) = 300
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-addon 1: attach pro then free add-on with messages")}`, async () => {
	const customerId = "legacy-addon-1";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const addOnMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const addOn = products.base({
		id: "addon",
		items: [addOnMessagesItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addOn.id }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addOn.id],
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Attach pro then free add-on twice
// (from addOn2)
//
// Scenario:
// - Pro product ($20/month) with no feature items
// - Free add-on with Credits feature (100 included)
// - Attach Pro, then attach add-on, then attach add-on again
//
// Expected:
// - Customer has both Pro and add-on active after each attachment
// - Credits feature balance remains 100 after second attach
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-addon 2: attach pro then free add-on twice")}`, async () => {
	const customerId = "legacy-addon-2";

	const pro = products.pro({ id: "pro", items: [] });

	const creditsItem = items.monthlyCredits();
	const addOn = products.base({
		id: "addon",
		items: [creditsItem],
		isAddOn: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addOn.id }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addOn.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Credits,
		balance: 100,
		usage: 0,
	});

	// Attach the same free add-on a second time
	await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id, addOn.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Credits,
		balance: 100,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Attach pro then monthly prepaid add-on with quantity
// (from basic2)
//
// Scenario:
// - Pro product ($20/month) with Messages feature (10 included)
// - Monthly prepaid add-on for Messages ($9/250 units, 0 included)
// - Attach Pro, then attach add-on with quantity 500 (2 packs)
//
// Expected:
// - Customer has both Pro and add-on active
// - 2 invoices (Pro $20, add-on $18)
// - Messages balance = 10 (Pro) + 500 (add-on) = 510
// - /check returns correct combined balance (using V0 entitled endpoint)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-addon 3: attach pro then monthly prepaid add-on with quantity")}`, async () => {
	const customerId = "legacy-addon-3";
	const monthlyQuantity = 500;

	const messagesItem = items.monthlyMessages({ includedUsage: 10 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const prepaidMessagesItem = items.prepaidMessages({
		price: 9,
		billingUnits: 250,
		includedUsage: 0,
	});
	const addOn = products.base({
		id: "monthly-add-on",
		items: [prepaidMessagesItem],
		isAddOn: true,
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Attach the prepaid add-on with quantity options (using AutumnCli like original)
	await AutumnCli.attach({
		customerId,
		productId: addOn.id,
		forceCheckout: false,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: monthlyQuantity,
			},
		],
	});

	// Use AutumnCli.getCustomer for V1 response format (entitlements, add_ons)
	const cusRes = (await AutumnCli.getCustomer(customerId)) as ApiCustomerV1;

	// Pro gives 10 Messages, add-on gives 500
	const expectedBalance = 10 + monthlyQuantity;

	const monthlyMessagesBalance = cusRes.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages && e.interval === "month",
	);
	expect(monthlyMessagesBalance?.balance).toBe(expectedBalance);

	expect(cusRes.add_ons).toHaveLength(1);
	const monthlyAddOnFound = cusRes.add_ons.find((a) => a.id === addOn.id);
	expect(monthlyAddOnFound).toBeDefined();

	expect(cusRes.invoices.length).toBe(2);

	// Verify /entitled returns correct balance (V0 endpoint with balances array)
	const entitledRes = (await AutumnCli.entitled(
		customerId,
		TestFeature.Messages,
	)) as {
		allowed: boolean;
		balances: { feature_id: string; balance: number }[];
	};
	const messagesBalance = entitledRes.balances.find(
		(b) => b.feature_id === TestFeature.Messages,
	);
	expect(messagesBalance?.balance).toBe(expectedBalance);
});
