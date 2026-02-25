/**
 * Setup Payment - With Customize Tests
 *
 * Tests that all attach params survive the setup payment metadata roundtrip
 * (stored in metadata → Stripe checkout → webhook → billingActions.attach).
 *
 * Covers: customize.price, customize.items, customize.free_trial,
 * feature_quantities, version, discounts.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { FreeTrialDuration } from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	calculateTrialEndMs,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeSetupPaymentFormV2 as completeSetupPaymentForm } from "@tests/utils/browserPool/completeSetupPaymentFormV2";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import testCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Setup + plan with custom price
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - New customer with NO payment method
 * - Base product has no price, only messages feature
 * - Call setupPayment with plan_id + customize.price = $30/mo
 *
 * Expected:
 * - After completing form: product attached with custom price
 * - Invoice = $30 (custom price, not the original $0)
 */
test.concurrent(`${chalk.yellowBright("setup-payment: attach plan with custom price")}`, async () => {
	const customerId = "setup-pay-customize-price";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const base = products.base({ id: "base", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}), // No payment method
			s.products({ list: [base] }),
		],
		actions: [],
	});

	// 1. Call setupPayment with customize.price
	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: base.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 30 }),
		},
	});

	expect(res.url).toBeDefined();

	// 2. Complete the setup form
	await completeSetupPaymentForm({ url: res.url });
	await timeout(4000);

	// 3. Verify plan attached with custom price
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: base.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Invoice should reflect the custom price ($30), not the original ($0)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 30,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Setup + plan with custom items (override plan features)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("setup-payment: custom items override")}`, async () => {
	const customerId = "setup-pay-customize-items";

	// products.pro() includes $20/month price already
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			items: [itemsV2.monthlyMessages({ included: 250 }), itemsV2.dashboard()],
		},
	});

	expect(res.url).toBeDefined();
	await completeSetupPaymentForm({ url: res.url });
	await timeout(4000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	// Items overridden: Messages should be 250 (not 100)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 250,
		balance: 250,
		usage: 0,
	});

	// Dashboard boolean feature should exist
	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	// Original price ($20) preserved since only items were customized
	await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 20 });

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Setup + plan with custom items + price + feature_quantities
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("setup-payment: custom items + price + feature_quantities")}`, async () => {
	const customerId = "setup-pay-customize-items-qty";

	const base = products.base({
		id: "base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [base] })],
		actions: [],
	});

	// $30 base price + prepaid messages at $10/100 units, purchasing 200 = $20
	// Total expected: $50
	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: base.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 30 }),
			items: [itemsV2.prepaidMessages({ amount: 10, billingUnits: 100 })],
		},
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});

	expect(res.url).toBeDefined();
	await completeSetupPaymentForm({ url: res.url });
	await timeout(4000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: base.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// $30 base + $20 prepaid (200 units at $10/100) = $50
	await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 50 });

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Setup + plan with custom free trial
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("setup-payment: custom free trial")}`, async () => {
	const customerId = "setup-pay-customize-trial";

	// products.pro() includes $20/month price already
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			free_trial: {
				duration_length: 7,
				duration_type: FreeTrialDuration.Day,
				card_required: true,
			},
		},
	});

	expect(res.url).toBeDefined();
	await completeSetupPaymentForm({ url: res.url });
	await timeout(4000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should be trialing, not active
	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: calculateTrialEndMs({ trialDays: 7 }),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Trial period: invoice total should be $0
	await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 0 });

	// Verify Stripe subscription is also in trialing state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Setup + plan with specific version
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Anchor customer (with PM) attaches v1, locking it
 * - Product updated to create v2 (200 messages, $40)
 * - Test customer (no PM, separate initScenario) does setupPayment with version: 1
 *
 * Expected:
 * - Test customer gets v1 (100 messages, $20), NOT v2
 */
test.concurrent(`${chalk.yellowBright("setup-payment: specific version")}`, async () => {
	const anchorId = "setup-pay-version-anchor";
	const testId = "setup-pay-version";

	const messagesV1 = items.monthlyMessages({ includedUsage: 100 });
	const priceV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesV1, priceV1] });

	// Anchor customer attaches v1, locking it. Clean up both customers upfront.
	const { autumnV1, ctx } = await initScenario({
		customerId: anchorId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro], customerIdsToDelete: [anchorId, testId] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Update product → creates v2 (v1 locked by anchor customer)
	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyMessages({ includedUsage: 200 }),
			items.monthlyPrice({ price: 40 }),
		],
	});

	// Create test customer (no PM) via second initScenario — no product re-init
	await initScenario({
		customerId: testId,
		setup: [s.customer({}), s.products({ list: [] })],
		actions: [],
	});

	// Setup payment for test customer requesting v1
	const res = await autumnV1.billing.setupPayment({
		customer_id: testId,
		plan_id: pro.id,
		version: 1,
	});

	expect(res.url).toBeDefined();
	await completeSetupPaymentForm({ url: res.url });
	await timeout(4000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(testId);

	await expectProductActive({ customer, productId: pro.id });

	// Should have v1 values (100 messages, $20), not v2 (200 messages, $40)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	const product = customer.products?.find((p) => p.id === pro.id);
	expect(product?.version).toBe(1);

	await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 20 });

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId: testId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Setup + plan with discount
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("setup-payment: discount")}`, async () => {
	const customerId = "setup-pay-discount";

	// products.pro() includes $20/month price already
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	// Create a 50% off coupon via Stripe
	const stripeCli = createStripeCli({ org: testCtx.org, env: testCtx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 50 });

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
	});

	expect(res.url).toBeDefined();
	await completeSetupPaymentForm({ url: res.url });
	await timeout(4000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// 50% off $20 = $10
	await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 10 });
});
