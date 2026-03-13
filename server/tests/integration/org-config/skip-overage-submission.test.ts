/**
 * Invoice Created Webhook Tests - Consumable Edge Cases
 *
 * Tests for edge case scenarios involving consumable (usage-in-arrear) prices
 * during downgrades, multiple subscriptions, and complex billing scenarios.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { db } from "@/db/initDrizzle";
import { OrgService } from "@/internal/orgs/OrgService";
import { expectCustomerFeatureCorrect } from "../billing/utils/expectCustomerFeatureCorrect";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Addon with separate subscription + consumable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) with consumable messages (100 included, $0.10/unit)
 * - Recurring Addon ($20/mo) with consumable words (50 included, $0.05/unit)
 *   - Addon attached with new_billing_subscription: true (separate Stripe subscription)
 * - Track 200 messages (100 overage) and 150 words (100 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Pro invoice: $20 base + $10 message overage = $30
 * - Addon invoice: $20 base + $5 word overage = $25
 * - Each subscription's invoice has its own product's overage
 */
test.concurrent(`${chalk.yellowBright("skip overage submission 1")}`, async () => {
	const customerId = "skip-overage-submission";

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});

	const pro = products.pro({
		id: "pro",
		items: [consumableMessagesItem],
	});

	// Save original org config and enable void_invoices_on_subscription_deletion
	// This must be set in the database because webhooks read config from DB, not request headers

	const { ctx, autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// 1. Attach Pro
			s.attach({ productId: pro.id }),
		],
	});

	await OrgService.update({
		db: db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				skip_overage_submission: true,
			},
		},
	});

	// Verify final state
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Both products should be active
	await expectProductActive({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	await timeout(2000);

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	// Should have 4 invoices:
	// 1. Initial Pro ($20)
	// 3. Pro renewal: $20 base + $10 overage = $30
	const customerAfterAdvance2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance2,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterAdvance2,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify both balances are reset correctly
	expect(customerAfterAdvance2.features[TestFeature.Messages].balance).toBe(
		100,
	);

	await OrgService.update({
		db: db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				skip_overage_submission: false,
			},
		},
	});
});
