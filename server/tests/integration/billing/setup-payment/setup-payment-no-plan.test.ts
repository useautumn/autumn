/**
 * Setup Payment - No Plan Tests
 *
 * Tests for standalone setup payment flow (no plan attachment).
 * Verifies that completing the setup form saves the customer's payment method.
 *
 * Key behaviors:
 * - Returns a Stripe checkout URL in setup mode
 * - After completing the form, the customer's default PM is saved
 * - Subsequent paid product attaches work without needing checkout redirect
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeSetupPaymentFormV2 as completeSetupPaymentForm } from "@tests/utils/browserPool/completeSetupPaymentFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Basic setup payment saves payment method
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - New customer with NO payment method
 * - Call setupPayment without plan_id
 *
 * Expected:
 * - Returns setup checkout URL
 * - After completing form, PM is saved
 * - Subsequent paid attach works without checkout redirect
 */
test.concurrent(`${chalk.yellowBright("setup-payment: basic setup saves payment method")}`, async () => {
	const customerId = "setup-pay-no-plan-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}), // No payment method, testClock defaults to true
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Call setupPayment without plan_id
	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
	});

	expect(res.customer_id).toBe(customerId);
	expect(res.url).toBeDefined();
	expect(res.url).toContain("checkout.stripe.com");

	// 2. Complete the Stripe setup form
	await completeSetupPaymentForm({ url: res.url });
	await timeout(4000);

	// 3. Attach pro product — should succeed without payment_url (PM saved)
	const attachResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(attachResult.payment_url).toBeNull();

	// 4. Verify product is now attached
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
