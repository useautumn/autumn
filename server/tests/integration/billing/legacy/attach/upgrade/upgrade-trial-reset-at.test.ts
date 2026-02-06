/**
 * Legacy Attach V1 Upgrade - Trial Feature Reset At Tests
 *
 * Tests that verify when upgrading from a paid product to a product with trial,
 * the feature's next_reset_at is correctly set to trial_end + 30 days
 * (billing cycle starts AFTER trial ends).
 *
 * Key behavior:
 * - When upgrading pro → premium (with trial), the new product starts a trial
 * - Feature next_reset_at = trial_end + 30 days (one billing cycle after trial)
 * - This tests the default behavior for upgrades to trial products
 */

import { test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade Pro → Premium (with 14-day trial)
// Feature reset_at = trial_end + 30 days
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro product (non-trial, paid)
 * - Upgrade to Premium with 14-day trial
 *
 * Expected Result:
 * - Premium product is trialing (trial_ends_at = now + 14 days)
 * - Feature next_reset_at = trial_end + 30 days (billing cycle starts AFTER trial)
 */
test.concurrent(`${chalk.yellowBright("v1 upgrade: pro → premium trial (reset_at = trial_end + 30 days)")}`, async () => {
	const customerId = "v1-upgrade-trial-reset-at";
	const trialDays = 14;

	// Pro: paid product, $20/mo, 500 messages
	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proPriceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [proMessagesItem, proPriceItem],
	});

	// Premium with trial: $50/mo, 1000 messages, 14-day trial
	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [premiumMessagesItem, premiumPriceItem],
		trialDays: trialDays,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			// Start with Pro (non-trial)
			s.attach({ productId: pro.id }),
		],
	});

	// Verify initial state on Pro (no trial)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Upgrade to Premium with trial using V1 attach
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify upgraded to Premium and trialing
	await expectProductActive({ customer: customerAfter, productId: premium.id });
	await expectProductTrialing({
		customer: customerAfter,
		productId: premium.id,
		trialEndsAt: advancedTo + ms.days(trialDays),
	});

	// KEY ASSERTION: next_reset_at = trial_end + 30 days
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: addMonths(advancedTo + ms.days(trialDays), 1).getTime(),
	});
});
