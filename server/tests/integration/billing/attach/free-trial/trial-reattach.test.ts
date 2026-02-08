/**
 * Free Trial Reattach Tests (Attach V2)
 *
 * Tests for cancel/reattach scenarios and trial prevention.
 *
 * Key behaviors:
 * - Cancel during trial cancels subscription
 * - Reattach same product gets fresh trial (based on unique_fingerprint)
 * - Scheduled switches can be cancelled
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Reattach same product after cancel (fresh trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer had proWithTrial, cancelled during trial
 * - Reattach same product (unique_fingerprint: false)
 *
 * Expected Result:
 * - Gets fresh trial (unique_fingerprint not enforced)
 */
test.concurrent(`${chalk.yellowBright("trial-reattach 2: reattach same product (fresh trial)")}`, async () => {
	const customerId = "trial-reattach-same-product";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 3 }),
			s.updateSubscription({
				productId: proTrial.id,
				cancelAction: "cancel_immediately" as const,
			}),
		],
	});

	// Verify product is removed after cancel
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	// 1. Preview reattach - should show $0 deduplicate trial
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
	});
	expect(preview.total).toBe(20);

	// 2. Reattach same product
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: proTrial.id,
	});

	// Verify gets fresh 7-day trial (from current time)
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Downgrade during trial then cancel scheduled
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premiumWithTrial (trialing)
 * - Downgrade to pro (scheduled)
 * - Cancel the scheduled pro
 *
 * Expected Result:
 * - Premium remains active and trialing
 * - Pro scheduled attachment is cancelled
 */
test.concurrent(`${chalk.yellowBright("trial-reattach 3: cancel scheduled downgrade during trial")}`, async () => {
	const customerId = "trial-reattach-cancel-scheduled";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, pro] }),
		],
		actions: [
			s.billing.attach({ productId: premiumTrial.id }),
			s.billing.attach({ productId: pro.id }), // Downgrade - scheduled
		],
	});

	// Cancel the scheduled pro
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premiumTrial.id,
		cancel_action: "uncancel" as const,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is active and still trialing
	await expectProductActive({
		customer,
		productId: premiumTrial.id,
	});

	await expectProductTrialing({
		customer,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify pro scheduled is cancelled (not present)
	await expectProductNotPresent({
		customer,
		productId: pro.id,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});
