/**
 * Invoice Paid Webhook Tests - Email Receipt
 *
 * Tests for the sendEmailReceipt task in the invoice.paid webhook handler.
 * Verifies that email receipts are sent (via PaymentIntent.receipt_email)
 * based on the customer's send_email_receipts flag.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Email receipt sent when send_email_receipts is true
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create customer and attach paid product
 * - Update customer to enable email receipts
 * - Advance to next billing cycle (triggers invoice.paid)
 *
 * Expected Result:
 * - PaymentIntent from the renewal invoice should have receipt_email set
 */
test(`${chalk.yellowBright("invoice.paid: sends email receipt when send_email_receipts is true")}`, async () => {
	const customerId = "inv-paid-email-receipt-enabled";
	const testEmail = "test-receipt@example.com";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	// Step 1: Create customer and attach product (initial invoice.paid fires here)
	const { ctx, customer, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const stripeCustomerId = customer?.processor?.id;
	expect(stripeCustomerId).toBeDefined();
	expect(testClockId).toBeDefined();

	// Step 2: Update customer to enable email receipts BEFORE the next invoice.paid
	await CusService.update({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
		update: {
			send_email_receipts: true,
			email: testEmail,
		},
	});

	// Small delay to ensure DB write is committed before webhook reads it
	await timeout(1000);

	// Verify the update was applied
	const updatedCustomer = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(updatedCustomer.send_email_receipts).toBe(true);
	expect(updatedCustomer.email).toBe(testEmail);

	// Step 3: Advance to next billing cycle - this triggers invoice.paid webhook
	// which should now set receipt_email on the PaymentIntent
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Wait for webhook processing
	await timeout(8000);

	// Step 4: Get invoices and find the latest paid one (the renewal)
	const invoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId!,
		status: "paid",
		limit: 10,
		expand: ["data.payments"],
	});

	// Should have 2 invoices: initial + renewal
	expect(invoices.data.length).toBeGreaterThanOrEqual(2);

	// The first invoice in the list is the most recent (renewal)
	const renewalInvoice = invoices.data[0];
	expect(renewalInvoice).toBeDefined();

	// Get payment intent ID from the invoice payments
	const payments = renewalInvoice.payments;
	const firstPayment = payments?.data?.[0];

	// The payment object contains payment_intent as a string ID
	const paymentObject = firstPayment?.payment as { payment_intent?: string };
	const paymentIntentId = paymentObject?.payment_intent;

	expect(paymentIntentId).toBeDefined();

	// Retrieve the payment intent and verify receipt_email is set
	const paymentIntent = await ctx.stripeCli.paymentIntents.retrieve(
		paymentIntentId as string,
	);

	expect(paymentIntent.receipt_email).toBe(testEmail);
}, 120000); // 2 minute timeout for test clock operations

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Email receipt NOT sent when send_email_receipts is false
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create customer and attach paid product
 * - Customer has send_email_receipts: false (default)
 * - Advance to next billing cycle (triggers invoice.paid)
 *
 * Expected Result:
 * - PaymentIntent from the renewal invoice should NOT have receipt_email set
 */
test(`${chalk.yellowBright("invoice.paid: does NOT send email receipt when send_email_receipts is false")}`, async () => {
	const customerId = "inv-paid-email-receipt-disabled";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	// Step 1: Create customer and attach product
	// Customer has send_email_receipts: false by default
	const { ctx, customer, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const stripeCustomerId = customer?.processor?.id;
	expect(stripeCustomerId).toBeDefined();
	expect(testClockId).toBeDefined();

	// Step 2: Advance to next billing cycle - this triggers invoice.paid webhook
	// Since send_email_receipts is false, receipt_email should NOT be set
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Wait for webhook processing
	await timeout(8000);

	// Step 3: Get invoices and find the latest paid one (the renewal)
	const invoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId!,
		status: "paid",
		limit: 10,
		expand: ["data.payments"],
	});

	// Should have 2 invoices: initial + renewal
	expect(invoices.data.length).toBeGreaterThanOrEqual(2);

	// The first invoice in the list is the most recent (renewal)
	const renewalInvoice = invoices.data[0];
	expect(renewalInvoice).toBeDefined();

	// Get payment intent ID from the invoice payments
	const payments = renewalInvoice.payments;
	const firstPayment = payments?.data?.[0];

	const paymentObject = firstPayment?.payment as { payment_intent?: string };
	const paymentIntentId = paymentObject?.payment_intent;

	expect(paymentIntentId).toBeDefined();

	// Retrieve the payment intent and verify receipt_email is NOT set
	const paymentIntent = await ctx.stripeCli.paymentIntents.retrieve(
		paymentIntentId as string,
	);

	expect(paymentIntent.receipt_email).toBeNull();
}, 120000); // 2 minute timeout for test clock operations

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Email receipt NOT sent when customer has no email
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create customer and attach paid product
 * - Update customer to enable email receipts but with empty email
 * - Advance to next billing cycle (triggers invoice.paid)
 *
 * Expected Result:
 * - PaymentIntent from the renewal invoice should NOT have receipt_email set
 *   because customer has no email address
 */
test(`${chalk.yellowBright("invoice.paid: does NOT send email receipt when customer has no email")}`, async () => {
	const customerId = "inv-paid-email-receipt-no-email";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	// Step 1: Create customer and attach product
	const { ctx, customer, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const stripeCustomerId = customer?.processor?.id;
	expect(stripeCustomerId).toBeDefined();
	expect(testClockId).toBeDefined();

	// Step 2: Enable email receipts but clear the email address
	await CusService.update({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
		update: {
			send_email_receipts: true,
			email: "", // Empty email
		},
	});

	// Small delay to ensure DB write is committed
	await timeout(1000);

	// Verify the update was applied
	const updatedCustomer = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(updatedCustomer.send_email_receipts).toBe(true);
	expect(updatedCustomer.email).toBe("");

	// Step 3: Advance to next billing cycle - this triggers invoice.paid webhook
	// Since customer has no email, receipt_email should NOT be set
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Wait for webhook processing
	await timeout(8000);

	// Step 4: Get invoices and find the latest paid one (the renewal)
	const invoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId!,
		status: "paid",
		limit: 10,
		expand: ["data.payments"],
	});

	// Should have 2 invoices: initial + renewal
	expect(invoices.data.length).toBeGreaterThanOrEqual(2);

	// The first invoice in the list is the most recent (renewal)
	const renewalInvoice = invoices.data[0];
	expect(renewalInvoice).toBeDefined();

	// Get payment intent ID from the invoice payments
	const payments = renewalInvoice.payments;
	const firstPayment = payments?.data?.[0];

	const paymentObject = firstPayment?.payment as { payment_intent?: string };
	const paymentIntentId = paymentObject?.payment_intent;

	expect(paymentIntentId).toBeDefined();

	// Retrieve the payment intent and verify receipt_email is NOT set
	const paymentIntent = await ctx.stripeCli.paymentIntents.retrieve(
		paymentIntentId as string,
	);

	expect(paymentIntent.receipt_email).toBeNull();
}, 120000); // 2 minute timeout for test clock operations
