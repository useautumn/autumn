/**
 * Multi-Attach Same Add-On Basic Tests
 *
 * Tests attaching 2x the same add-on product in a single multi-attach call,
 * with different feature_quantities for each instance.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
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
// Test 1: 2x same tiered prepaid add-on with distinct quantities
//
// Scenario:
// - Main plan: Pro ($20/mo) with 500 monthly messages
// - Add-on: tiered prepaid messages (100 included, $10/pack after)
// - Instance A: quantity 200 messages
// - Instance B: quantity 500 messages
//
// Expected:
// - Pro + 2x add-on instances active
// - Messages: 500 (main) + 300 (A: 100 included + 200 purchased) + 600 (B: 100 included + 500 purchased) = 1400
// - Invoice = $20 (pro) + tiered cost A + tiered cost B
// - Stripe subscription has 2 separate inline items (independent tier calculations)
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach same add-on: 2x same tiered prepaid add-on with distinct quantities")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 500 });

	const mainPlan = products.pro({ id: "main", items: [messagesItem] });

	// Add-on with tiered prepaid: 100 included, then $10/100 units, $5/100 after 500
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
		customerId: "ma-same-addon-basic",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainPlan, prepaidAddon] }),
		],
		actions: [s.billing.attach({ productId: mainPlan.id })],
	});

	const multiAttachParams = {
		customer_id: customerId,
		plans: [
			{
				plan_id: prepaidAddon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 200 },
				],
			},
			{
				plan_id: prepaidAddon.id,
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 500 },
				],
			},
		],
	};

	// 1. Preview
	// Instance A: 100 purchased / 100 billing units = 2 packs @ $10 = $10
	// Instance B: 400 purchased / 100 billing units = 4 packs @ $10 = $40
	// Total: $10 + $40 = $50
	const preview = await autumnV1.billing.previewMultiAttach(multiAttachParams);
	expect(preview.total).toEqual(50);

	// 2. Attach
	await autumnV1.billing.multiAttach(multiAttachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [mainPlan.id, prepaidAddon.id],
	});

	// Messages: 500 (main) + 200 (addon A) + 500 (addon B) = 1200
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 1200,
	});

	// Invoice: $20 (pro base from initial attach) + latest should be the multi-attach invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50,
	});

	// Stripe subscription must have separate inline items for each add-on
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
