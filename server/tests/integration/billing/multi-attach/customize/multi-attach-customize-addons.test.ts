/**
 * Multi-Attach Same Add-On Customize Tests
 *
 * Tests attaching 2x the same add-on product in a single multi-attach call,
 * with different customized prepaid feature prices on each instance.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	BillingInterval,
	type MultiAttachParamsV0Input,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Test 1: 2x same add-on with custom prepaid pricing per instance
//
// Scenario:
// - Main plan: Pro ($20/mo) with messages
// - Add-on: tiered prepaid messages (100 included, $10/100 units after)
// - Attach add-on twice with different custom prices:
//   Instance A: custom price $15/100 units, quantity 200
//   Instance B: custom price $25/100 units, quantity 300
//
// Expected:
// - Pro + 2x add-on active
// - Messages balance = 500 + 100 + 100 = 700 (200 + 300 purchased, 100 included per addon)
// - Invoice = $20 (pro base) + custom charges for each add-on
// - Stripe subscription has separate inline items for each add-on
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach same add-on customize: 2x same add-on with different custom prepaid prices")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });

	const mainPlan = products.pro({ id: "main", items: [messagesItem] });

	// Add-on with tiered prepaid messages: 100 included, then $10/pack (100 units/pack)
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

	const { customerId, autumnV1, autumnV2, ctx } = await initScenario({
		customerId: "ma-same-addon-customize",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainPlan, prepaidAddon] }),
		],
		actions: [s.billing.attach({ productId: mainPlan.id })],
	});

	const multiAttachParams: MultiAttachParamsV0Input = {
		customer_id: customerId,
		plans: [
			{
				plan_id: prepaidAddon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 200 },
				],
				customize: {
					price: {
						amount: 15,
						interval: BillingInterval.Month,
					},
				},
			},
			{
				plan_id: prepaidAddon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 300 },
				],
				customize: {
					price: {
						amount: 25,
						interval: BillingInterval.Month,
					},
				},
			},
		],
	};

	const basePriceTotal = 25 + 15;
	const prepaidPriceTotal = 1 * 10 + 2 * 10;
	const expectedTotal = basePriceTotal + prepaidPriceTotal;
	// 1. Preview
	const preview = await autumnV2.billing.previewMultiAttach(multiAttachParams);
	// Instance A: $15 custom price, Instance B: $25 custom price
	expect(preview.total).toBeGreaterThanOrEqual(expectedTotal - 0.01);
	expect(preview.total).toBeLessThanOrEqual(expectedTotal + 0.01);

	// 2. Attach
	await autumnV2.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Both add-on instances should be active alongside main plan
	await expectCustomerProducts({
		customer,
		active: [mainPlan.id, prepaidAddon.id],
	});

	// Messages: 500 (main) + 200 (addon A purchased) + 300 (addon B purchased)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 1000,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: expectedTotal,
	});

	// Stripe subscription should have separate inline items for each add-on
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
