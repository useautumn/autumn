import { expect, test } from "bun:test";
import { completeSetupPaymentForm } from "@tests/utils/browserPool";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { FreeTrialDuration } from "@autumn/shared";
import chalk from "chalk";

/**
 * Tests for standalone setupPayment endpoint.
 * These tests verify that when a customer adds a payment method via setupPayment(),
 * their existing subscriptions are properly updated to use the new payment method.
 */

test.concurrent(`${chalk.yellowBright("setup-payment: invoices are paid after adding payment method during trial")}`, async () => {
	const messagesItem = items.monthlyMessages({
		includedUsage: 0,
	});

	const premium = products.base({
		id: "premium",
		items: [items.monthlyPrice({ price: 50 })],
		freeTrial: {
			length: 7,
			duration: FreeTrialDuration.Day,
			uniqueFingerprint: false,
			cardRequired: false,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { customerId, autumnV1, testClockId, ctx } = await initScenario({
		customerId: "setup-payment-after-trial",
		setup: [s.customer({}), s.products({ list: [pro, premium] })],
		actions: [
			s.attach({ productId: premium.id }),
			s.attach({ productId: pro.id }),
		],
	});

	// Get setup payment URL and complete the form
	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
	});

	await completeSetupPaymentForm({ url: res.url! });

	// Advance clock past trial (7 days) + buffer to trigger invoice
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 18,
		waitForSeconds: 30,
	});

	// Verify all invoices are paid
	const customer = await autumnV1.customers.get(customerId);

	const allInvoicesPaid = customer.invoices?.every(
		(invoice) => invoice.status === "paid",
	);
	expect(allInvoicesPaid).toBe(true);
});
