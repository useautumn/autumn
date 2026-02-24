/**
 * Stripe Checkout Trial Tests (Attach V2)
 *
 * Tests for Stripe Checkout flow with trial periods.
 * When product has cardRequired: true and customer has no PM,
 * checkout captures card and starts trial after completion.
 *
 * Key behaviors:
 * - Trial with cardRequired: true → checkout captures card
 * - Trial starts after checkout completion
 * - subscription_data.trial_end set correctly in checkout
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Trial with card required via checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product with trialDays: 7, cardRequired: true
 * - Customer with NO payment method
 *
 * Expected Result:
 * - Checkout captures card (no charge yet - trial)
 * - Trial starts after checkout completion
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: trial card required")}`, async () => {
	const customerId = "stripe-checkout-trial-card";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-checkout",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	// 1. Preview attach - should show $0 (trial, card captured but not charged)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
	});
	expect(preview.total).toBe(0);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// 4. Verify product is trialing
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proTrial.id,
	});

	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify messages feature available during trial
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify $0 invoice for trial (Stripe creates invoice for trial subscriptions)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Trial with 14 days via checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product with trialDays: 14, cardRequired: true
 * - Customer with NO payment method
 *
 * Expected Result:
 * - Checkout has correct trial_end in subscription_data
 * - 14-day trial starts after completion
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: trial subscription_data")}`, async () => {
	const customerId = "stripe-checkout-trial-14d";

	const messagesItem = items.monthlyMessages({ includedUsage: 200 });
	const proTrial = products.proWithTrial({
		id: "pro-trial-14d",
		items: [messagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	// 1. Preview attach - should show $0 (trial)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
	});
	expect(preview.total).toBe(0);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
	});

	expect(result.payment_url).toBeDefined();

	// 3. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// 4. Verify product is trialing with correct end date
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proTrial.id,
	});

	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify features available during trial
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Verify $0 invoice for trial (Stripe creates invoice for trial subscriptions)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});
});
