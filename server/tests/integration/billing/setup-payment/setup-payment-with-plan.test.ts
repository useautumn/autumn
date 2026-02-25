/**
 * Setup Payment - With Plan Tests
 *
 * Tests for setup payment with plan_id (deferred plan attachment).
 * After the customer completes the setup form, the webhook handler:
 * 1. Saves the customer's default payment method
 * 2. Calls billingActions.attach() with the stored params
 *
 * Key behaviors:
 * - plan_id is validated via preview before creating the checkout session
 * - Params are stored in metadata and survive the roundtrip to the webhook
 * - Paid plans get a Stripe subscription after setup
 * - Free plans get attached without a subscription
 * - feature_quantities pass through metadata to the attach call
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeSetupPaymentFormV2 as completeSetupPaymentForm } from "@tests/utils/browserPool/completeSetupPaymentFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Setup + paid plan
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - New customer with NO payment method
 * - Call setupPayment with plan_id for pro ($20/mo)
 *
 * Expected:
 * - Returns setup checkout URL
 * - After completing form: PM saved, pro attached, invoice paid
 */
test.concurrent(`${chalk.yellowBright("setup-payment: attach paid plan after setup")}`, async () => {
	const customerId = "setup-pay-paid-plan";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}), // No payment method
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Call setupPayment with plan_id
	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: pro.id,
	});

	expect(res.customer_id).toBe(customerId);
	expect(res.url).toBeDefined();
	expect(res.url).toContain("checkout.stripe.com");

	// 2. Complete the setup form
	await completeSetupPaymentForm({ url: res.url });
	await timeout(4000);

	// 3. Verify plan was attached by the webhook
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Setup + free plan
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - New customer with NO payment method
 * - Call setupPayment with plan_id for a free product
 *
 * Expected:
 * - Returns setup checkout URL
 * - After completing form: PM saved, free product attached
 * - No invoice, no Stripe subscription (free product)
 */
test.concurrent(`${chalk.yellowBright("setup-payment: attach free plan after setup")}`, async () => {
	const customerId = "setup-pay-free-plan";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({ id: "free", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [],
	});

	// 1. Call setupPayment with free plan_id
	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: free.id,
	});

	expect(res.url).toBeDefined();

	// 2. Complete the setup form
	await completeSetupPaymentForm({ url: res.url });
	await timeout(4000);

	// 3. Verify free plan was attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: free.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	// Free product: no invoices, no Stripe subscription
	await expectCustomerInvoiceCorrect({ customer, count: 0 });

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Setup + plan with feature_quantities (prepaid)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - New customer with NO payment method
 * - Call setupPayment with plan_id for pro + prepaid messages quantity
 *
 * Expected:
 * - Returns setup checkout URL
 * - After completing form: pro attached with correct prepaid balance
 * - Invoice = base ($20) + prepaid (2 packs × $10 = $20) = $40
 */
test.concurrent(`${chalk.yellowBright("setup-payment: attach plan with feature_quantities (prepaid)")}`, async () => {
	const customerId = "setup-pay-prepaid";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	// 1. Call setupPayment with feature_quantities
	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: pro.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});

	expect(res.url).toBeDefined();

	// 2. Complete the setup form
	await completeSetupPaymentForm({ url: res.url });
	await timeout(4000);

	// 3. Verify plan attached with correct prepaid balance
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	// Invoice: $20 base + $20 prepaid (200 units / 100 billingUnits × $10) = $40
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 40,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
