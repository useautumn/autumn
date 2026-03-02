/**
 * Multi-Attach Same Add-On Checkout Tests
 *
 * Tests attaching 2x the same add-on product via Stripe Checkout,
 * with different feature_quantities for each instance.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Test 1: 2x same tiered prepaid add-on via checkout
//
// Scenario:
// - No payment method (forces Stripe Checkout)
// - Main plan: Pro ($20/mo)
// - Add-on: tiered prepaid messages (100 included, $10/100 units)
// - Multi-attach: main plan + 2x add-on with different quantities
//
// Expected:
// - Checkout URL returned
// - After checkout: all products active
// - Messages balance correct
// - Stripe subscription has inline items for each add-on
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach checkout same add-on: 2x tiered prepaid add-on via checkout")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 200 });

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
		customerId: "ma-co-same-addon-tiered",
		setup: [
			s.customer({ testClock: true }), // No payment method → checkout
			s.products({ list: [mainPlan, prepaidAddon] }),
		],
		actions: [],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [
			{ plan_id: mainPlan.id },
			{
				plan_id: prepaidAddon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 200 },
				],
			},
			{
				plan_id: prepaidAddon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 300 },
				],
			},
		],
	};

	// Preview:
	// Pro base = $20
	// A: (200 - 100 included) / 100 = 1 pack @ $10 = $10
	// B: (300 - 100 included) / 100 = 2 packs @ $10 = $20
	// Total: $20 + $10 + $20 = $50
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toEqual(50);

	const result = await autumnV1.billing.multiAttach(multiAttachParams, {
		timeout: 0,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [mainPlan.id, prepaidAddon.id],
	});

	// Messages: 200 (main) + 200 (addon A) + 300 (addon B) = 700
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 700,
	});

	// Invoice: $20 (pro) + addon A cost + addon B cost
	// A: (200 - 100 included) / 100 = 1 pack @ $10 = $10
	// B: (300 - 100 included) / 100 = 2 packs @ $10 = $20
	// Total: $20 + $10 + $20 = $50
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 50,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
