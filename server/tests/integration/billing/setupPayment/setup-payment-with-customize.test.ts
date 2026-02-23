/**
 * Setup Payment - With Customize Tests
 *
 * Tests for setup payment with plan_id + customize params.
 * Verifies that customize params survive the metadata roundtrip
 * (stored in metadata → retrieved in webhook → passed to billingActions.attach).
 *
 * Key behaviors:
 * - customize.price overrides the plan's base price
 * - Customized params are stored in deferred metadata
 * - The webhook applies the customization when attaching the plan
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
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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
