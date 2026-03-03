/**
 * Attach Prepaid Add-On Tests
 *
 * Tests attaching a tiered prepaid add-on product (with included usage),
 * then attaching the same add-on again. The second attach should create
 * a second customer product with independent tier calculations.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV0Input } from "@autumn/shared";
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
// Test 1: Attach tiered prepaid add-on, then attach the same one again
//
// Scenario:
// - Main plan: Pro ($20/mo) with 100 monthly messages
// - Add-on: tiered prepaid messages (100 included, $10/pack graduated)
// - First attach: add-on with quantity 200 (paid = 200 - 100 = 100)
// - Second attach: same add-on with quantity 300 (paid = 300 - 100 = 200)
//
// Expected:
// - Main + 2x add-on active
// - Messages: 100 (main) + 200 (addon 1) + 300 (addon 2) = 600
// - 2 invoices for the add-on attaches (+ 1 for main = 3 total)
// - Stripe subscription has 2 separate inline items for the add-ons
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("attach prepaid addon: attach tiered prepaid add-on twice")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const mainPlan = products.pro({ id: "main", items: [messagesItem] });

	// Tiered prepaid add-on: 100 included, then $10/100 units graduated
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
		customerId: "attach-prepaid-addon-twice",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainPlan, prepaidAddon] }),
		],
		actions: [
			s.billing.attach({ productId: mainPlan.id }),
			s.billing.attach({
				productId: prepaidAddon.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	// First add-on already attached in setup. Now attach the same one again.
	const attachParams: AttachParamsV0Input = {
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	};

	// 1. Preview second add-on
	// (300 - 100 included) / 100 = 2 packs @ $10 = $20
	const preview = await autumnV1.billing.previewAttach<AttachParamsV0Input>(attachParams);
	expect(preview.total).toEqual(20);

	// 2. Attach second instance
	await autumnV1.billing.attach<AttachParamsV0Input>(attachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [mainPlan.id, prepaidAddon.id],
	});

	// Messages: 100 (main) + 200 (addon 1) + 300 (addon 2) = 600
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 600,
	});

	// Invoices: 1 (main) + 1 (first addon) + 1 (second addon) = 3
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 20,
	});

	// Stripe subscription should have separate inline items for each add-on
	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: Attach flat prepaid add-on twice, verify quantities don't stack
//
// Scenario:
// - Main plan: Pro ($20/mo) with 100 monthly messages
// - Add-on: simple flat prepaid messages ($10/100 units, no included usage)
// - First attach: 200 messages
// - Second attach: 400 messages
//
// Expected:
// - Both add-on instances active
// - Messages: 100 + 200 + 400 = 700
// - Stripe subscription has 2 inline items (not 1 merged item with qty 6)
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("attach prepaid addon: flat prepaid add-on twice")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const mainPlan = products.pro({ id: "main", items: [messagesItem] });

	const prepaidAddon = products.base({
		id: "flat-addon",
		isAddOn: true,
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
			}),
		],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "attach-flat-addon-twice",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [mainPlan, prepaidAddon] }),
		],
		actions: [
			s.billing.attach({ productId: mainPlan.id }),
			s.billing.attach({
				productId: prepaidAddon.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	const attachParams: AttachParamsV0Input = {
		customer_id: customerId,
		product_id: prepaidAddon.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
	};

	// 1. Preview: 400/100 = 4 packs @ $10 = $40
	const preview = await autumnV1.billing.previewAttach<AttachParamsV0Input>(attachParams);
	expect(preview.total).toEqual(40);

	// 2. Attach
	await autumnV1.billing.attach<AttachParamsV0Input>(attachParams);

	// 3. Verify
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [mainPlan.id, prepaidAddon.id],
	});

	// Messages: 100 (main) + 200 (addon 1) + 400 (addon 2) = 700
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 700,
	});

	// Invoices: 1 (main) + 1 (first addon) + 1 (second addon) = 3
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 40,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
