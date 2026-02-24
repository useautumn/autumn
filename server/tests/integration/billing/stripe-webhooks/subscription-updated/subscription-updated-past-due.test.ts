/**
 * Subscription Updated Webhook - Past Due Tests
 *
 * Tests for handling the `customer.subscription.updated` Stripe webhook event
 * when a subscription enters past_due status due to failed payment.
 *
 * These tests simulate payment failures by attaching a failing payment method,
 * then advancing to the next billing cycle where the renewal invoice fails.
 *
 * The webhook handler should:
 * - Update customer product status to past_due
 * - Maintain the product features while in past_due state
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductPastDue } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Subscription enters past_due after failed payment at renewal
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro product ($20/mo) with messages feature
 * - Attach pro to customer with successful payment method
 * - Switch to a failing payment method
 * - Advance to next billing cycle (invoice will fail)
 *
 * Expected Result:
 * - Pro product status becomes past_due
 * - Renewal invoice is open (unpaid)
 */
test.concurrent(`${chalk.yellowBright("sub.updated: product enters past_due after failed renewal payment")}`, async () => {
	const customerId = "sub-updated-past-due-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 10 });
	const dashboardItem = items.dashboard();
	const adminItem = items.adminRights();

	const pro = products.pro({
		id: "pro",
		items: [dashboardItem, messagesItem, adminItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
			s.advanceTestClock({ toNextInvoice: true }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductPastDue({
		customer,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		invoiceIndex: 0,
		latestTotal: 20,
		latestStatus: "open",
		latestInvoiceProductId: pro.id,
	});
});
