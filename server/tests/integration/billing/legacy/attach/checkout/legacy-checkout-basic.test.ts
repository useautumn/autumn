/**
 * Legacy Checkout Basic Tests
 *
 * Migrated from:
 * - server/tests/attach/checkout/checkout1.test.ts (basic stripe checkout)
 * - server/tests/attach/checkout/checkout2.test.ts (one-time add-on via force_checkout)
 * - server/tests/attach/checkout/checkout3.test.ts (multi-product checkout)
 *
 * Tests V1 attach behavior through Stripe checkout flows:
 * - Basic product checkout via checkout URL
 * - One-time add-on purchases with force_checkout
 * - Multi-product checkout (product_ids array)
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV1,
	ApiCustomerV3,
	CheckResponseV0,
} from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Basic Stripe checkout
// (from checkout1)
//
// Scenario:
// - Pro product ($20/month) with Dashboard (boolean), Messages (10 included), Admin (unlimited)
// - Customer attaches via checkout URL
//
// Expected:
// - Customer has Pro active
// - 1 invoice for $20
// - Check endpoint returns correct balances for all features
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-checkout 1: basic stripe checkout")}`, async () => {
	const customerId = "legacy-checkout-1";

	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 10 });
	const adminItem = items.adminRights();
	const pro = products.pro({
		id: "pro",
		items: [dashboardItem, messagesItem, adminItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	// Attach via checkout URL
	const { checkout_url } = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	await completeStripeCheckoutFormV2({ url: checkout_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	// Verify /check returns correct balances for each feature
	const dashboardCheck = (await AutumnCli.entitled(
		customerId,
		TestFeature.Dashboard,
	)) as CheckResponseV0;
	expect(dashboardCheck.allowed).toBe(true);

	const messagesCheck = (await AutumnCli.entitled(
		customerId,
		TestFeature.Messages,
	)) as CheckResponseV0;
	expect(messagesCheck.allowed).toBe(true);
	const messagesBalance = messagesCheck.balances.find(
		(b) => b.feature_id === TestFeature.Messages,
	);
	expect(messagesBalance?.balance).toBe(10);

	const adminCheck = (await AutumnCli.entitled(
		customerId,
		TestFeature.AdminRights,
	)) as CheckResponseV0;
	expect(adminCheck.allowed).toBe(true);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: One-time add-on via force_checkout
// (from checkout2)
//
// Scenario:
// - Pro product ($20/month) with Dashboard (boolean), Messages (10 included), Admin (unlimited)
// - One-off add-on with prepaid messages ($9/250 units)
// - Attach Pro, then attach add-on twice via force_checkout
//
// Expected:
// - Customer has Pro and add-on
// - 3 invoices (Pro $20, add-on $9 x2)
// - Messages balance = 10 (Pro) + 500 (add-on purchases) + 500 (second purchase) = 1010
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-checkout 2: one-time add-on via force_checkout")}`, async () => {
	const customerId = "legacy-checkout-2";
	const oneTimeQuantity = 500;
	const oneTimeBillingUnits = 250;
	const oneTimePurchaseCount = 2;

	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 10 });
	const adminItem = items.adminRights();
	const pro = products.pro({
		id: "pro",
		items: [dashboardItem, messagesItem, adminItem],
	});

	const oneOffItem = items.oneOffMessages({
		price: 9,
		billingUnits: oneTimeBillingUnits,
		includedUsage: 0,
	});
	const oneOff = products.oneOffAddOn({
		id: "one_off",
		items: [oneOffItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, oneOff] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Purchase one-off add-on twice via force_checkout
	for (let i = 0; i < oneTimePurchaseCount; i++) {
		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			force_checkout: true,
		});

		await completeStripeCheckoutFormV2({
			url: res.checkout_url,
			overrideQuantity: oneTimeQuantity / oneTimeBillingUnits,
		});
	}

	const cusRes = (await AutumnCli.getCustomer(customerId)) as ApiCustomerV1;

	// Find the add-on balance for Messages with lifetime interval (one-time purchase)
	const addOnBalance = cusRes.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages && e.interval === "lifetime",
	);
	const expectedAddOnBalance = oneTimeQuantity * oneTimePurchaseCount;
	expect(addOnBalance?.balance).toBe(expectedAddOnBalance);

	expect(cusRes.add_ons).toHaveLength(1);
	expect(cusRes.add_ons[0].id).toBe(oneOff.id);
	expect(cusRes.invoices.length).toBe(1 + oneTimePurchaseCount);

	// Verify /check returns correct combined balance
	const res = (await AutumnCli.entitled(
		customerId,
		TestFeature.Messages,
	)) as CheckResponseV0;
	expect(res.allowed).toBe(true);

	const proMeteredAmt = 10;
	const messagesBalance = res.balances.find(
		(b) => b.feature_id === TestFeature.Messages,
	);
	expect(messagesBalance?.balance).toBe(proMeteredAmt + expectedAddOnBalance);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Multi-product checkout
// (from checkout3)
//
// Scenario:
// - Pro product ($20/month) with Messages (100 included)
// - One-off add-on with Users (5 included)
// - Attach both via product_ids array in single checkout
//
// Expected:
// - Customer has both Pro and add-on active
// - Features correct for both products
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-checkout 3: multi-product checkout")}`, async () => {
	const customerId = "legacy-checkout-3";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const usersItem = items.monthlyUsers({ includedUsage: 5 });
	const oneOff = products.oneOffAddOn({
		id: "one_off",
		items: [usersItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro, oneOff] }),
		],
		actions: [],
	});

	// Attach both products via product_ids
	const res = await autumnV1.attach({
		customer_id: customerId,
		product_ids: [pro.id, oneOff.id],
	});

	await completeStripeCheckoutFormV2({ url: res.checkout_url });
	await timeout(10000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, oneOff.id],
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 30, // Pro $20 + one-off $10
		latestInvoiceProductIds: [pro.id, oneOff.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		balance: 5,
		usage: 0,
	});
});
