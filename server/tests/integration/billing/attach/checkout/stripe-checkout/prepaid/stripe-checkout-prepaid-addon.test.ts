/**
 * Stripe Checkout Prepaid Add-On Tests
 *
 * Tests:
 * 1. First purchase of a tiered prepaid add-on via Stripe Checkout,
 *    then second purchase via subscription update (direct attach with PM on file).
 * 2. Checkout prepaid add-on, then update quantity.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	AttachParamsV0,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Test 1: Checkout prepaid add-on, then attach same add-on again
//
// Scenario:
// - Main plan: Pro ($20/mo) with 100 monthly messages (pre-attached with PM)
// - Add-on: tiered prepaid messages (100 included, $10/100 units)
// - First add-on: via Stripe Checkout (no PM on customer initially)
// - Second add-on: direct attach (PM now on file from checkout)
//
// Expected:
// - Main + 2x add-on active
// - Messages balance: 100 (main) + 200 (addon 1) + 300 (addon 2) = 600
// - Stripe subscription has independent inline items for each add-on
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("stripe checkout prepaid addon: checkout first, then direct attach second")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const prepaidAddon = products.base({
		id: "prepaid-addon",
		isAddOn: true,
		items: [
			items.tieredPrepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				tiers: [
					{ to: 500, amount: 10 },
					{ to: "inf", amount: 5 },
				],
			}),
		],
	});

	// Set up main plan with PM, but we'll do the first add-on via checkout
	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "co-prepaid-addon-then-direct",
		setup: [s.customer({}), s.products({ list: [prepaidAddon] })],
		actions: [],
	});

	// First add-on via checkout (redirect_mode: "always")
	const checkoutResult = await autumnV1.billing.attach<AttachParamsV0>({
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "always",
	});

	expect(checkoutResult.payment_url).toBeDefined();
	expect(checkoutResult.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: checkoutResult.payment_url });

	// Verify first add-on is attached
	const customerAfterFirst =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterFirst,
		active: [prepaidAddon.id],
	});

	// Messages: 200 (addon 1)
	expectCustomerFeatureCorrect({
		customer: customerAfterFirst,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	// Second add-on: direct attach (PM now on file)
	const secondAttachParams: AttachParamsV0 = {
		customer_id: customerId,
		product_id: prepaidAddon.id,
		redirect_mode: "if_required",
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	};

	const preview =
		await autumnV1.billing.previewAttach<AttachParamsV0>(secondAttachParams);
	// (300 - 100 included) / 100 = 2 packs @ $10 = $20
	expect(preview.total).toEqual(20);

	await autumnV1.billing.attach<AttachParamsV0>(secondAttachParams);

	// Verify final state
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerFinal,
		active: [prepaidAddon.id],
	});

	// Messages: 300 (addon 2)
	expectCustomerFeatureCorrect({
		customer: customerFinal,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	// Stripe subscription should have 2 separate inline items for add-ons
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: Checkout prepaid add-on, then update quantity
//
// Scenario:
// - Main plan: Pro ($20/mo) attached with PM
// - Add-on: tiered prepaid messages (100 included, $10/100 units)
// - Attach via checkout with quantity 200 (paid = 200 - 100 = 100)
// - Update subscription to change quantity to 500 (paid = 500 - 100 = 400)
//
// Expected:
// - Messages balance reflects updated quantity
// - Stripe subscription updated correctly
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("stripe checkout prepaid addon: checkout then update quantity")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const mainPlan = products.pro({ id: "main", items: [messagesItem] });

	const prepaidAddon = products.base({
		id: "prepaid-addon",
		isAddOn: true,
		items: [
			items.tieredPrepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				tiers: [
					{ to: 500, amount: 10 },
					{ to: "inf", amount: 5 },
				],
			}),
		],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "co-prepaid-addon-update-qty",
		setup: [s.customer({}), s.products({ list: [mainPlan, prepaidAddon] })],
		actions: [],
	});

	// Attach add-on via checkout
	const checkoutResult = await autumnV1.billing.attach<AttachParamsV0>({
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "always",
	});

	expect(checkoutResult.payment_url).toBeDefined();
	await completeStripeCheckoutForm({ url: checkoutResult.payment_url });

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 200, // 200 (addon)
	});

	// Update quantity from 200 to 500
	const updateParams: UpdateSubscriptionV0Params = {
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
	};

	const updatePreview =
		await autumnV1.subscriptions.previewUpdate<UpdateSubscriptionV0Params>(
			updateParams,
		);
	// Old: (200 - 100) / 100 = 1 pack @ $10 = $10
	// New: (500 - 100) / 100 = 4 packs @ $10 = $40
	// Delta: $40 - $10 = $30
	expect(updatePreview.total).toEqual(30);

	await autumnV1.subscriptions.update<UpdateSubscriptionV0Params>(updateParams);

	// Verify updated state
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Messages: 100 (main) + 500 (updated addon) = 600
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		balance: 500,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
