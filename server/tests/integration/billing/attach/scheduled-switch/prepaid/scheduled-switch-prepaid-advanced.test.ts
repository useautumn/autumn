/**
 * Scheduled Switch Prepaid Advanced Tests (Attach V2)
 *
 * Tests for downgrades involving products with BOTH recurring base prices
 * AND one-off prepaid prices (mixed products).
 *
 * Previously blocked by isMixedProduct check in handleScheduledSwitchOneOffErrors.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Mixed product downgrade, no options
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium ($50/mo) with one-off prepaid messages (500 units)
 * - Downgrade to Pro ($20/mo) with one-off prepaid, no options passed
 *
 * Expected:
 * - Scheduled switch succeeds
 * - Total units preserved, converted to new billing units
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid-advanced 2: mixed product downgrade, no options")}`, async () => {
	const customerId = "sched-switch-prepaid-adv-2";

	const premiumOneOff = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumOneOff],
	});

	const proOneOff = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proOneOff],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
				timeout: 2000,
			}),
		],
	});

	// Downgrade with NO options
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20,
	});

	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id],
		notPresent: [premium.id],
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});
