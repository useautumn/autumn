/**
 * Free Trial Payment Method Tests (Attach V2)
 *
 * Tests for card_required vs card not required trial behavior.
 *
 * Key behaviors:
 * - card_required: true → Must have payment method to start trial
 * - card_required: false → Can start trial without payment method
 * - Payment method can be added during trial
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Card required - without payment method (should redirect to checkout)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Card NOT required - without payment method
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has card_required: false
 * - Customer does NOT have payment method
 *
 * Expected Result:
 * - Trial starts without payment method
 * - No checkout redirect
 */
test.concurrent(`${chalk.yellowBright("trial-payment 3: card not required - no payment method")}`, async () => {
	const customerId = "trial-payment-no-card-req";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrialNoCard = products.proWithTrial({
		id: "pro-trial-nocard",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: false, // Card NOT required
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({}), // No payment method
			s.products({ list: [proTrialNoCard] }),
		],
		actions: [],
	});

	// 1. Preview attach - should show $0 (trial), next_cycle shows pro price
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrialNoCard.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7), // Trial end
		total: 20, // Pro price after trial
	});

	// 2. Attach product - should succeed without payment method
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrialNoCard.id,
		redirect_mode: "if_required",
	});

	// Should NOT redirect to checkout
	expect(result.checkout_url).toBeUndefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active and trialing
	await expectProductActive({
		customer,
		productId: proTrialNoCard.id,
	});

	await expectProductTrialing({
		customer,
		productId: proTrialNoCard.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify features available with resetsAt aligned to trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(7),
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	// Verify Stripe subscription state (trial without card)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});
