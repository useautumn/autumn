import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { timeout } from "@/utils/genUtils";

test(`${chalk.yellowBright("invoice.paid: sends email receipt when send_email_receipts is true")}`, async () => {
	const customerId = "inv-paid-email-receipt-enabled";
	const testEmail = "test-receipt@example.com";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { ctx, customer, testClockId, autumnV1 } = await initScenario({
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

	await autumnV1.customers.update(customerId, {
		send_email_receipts: true,
		email: testEmail,
	});

	await timeout(1000);

	const updatedCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	expect(updatedCustomer.send_email_receipts).toBe(true);
	expect(updatedCustomer.email).toBe(testEmail);

	const stripeCustomer = await ctx.stripeCli.customers.retrieve(
		stripeCustomerId!,
	);
	if (!stripeCustomer.deleted) {
		expect(stripeCustomer.email).toBe(testEmail);
	}

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await timeout(8000);

	const invoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId!,
		status: "paid",
		limit: 10,
		expand: ["data.payments"],
	});

	expect(invoices.data.length).toBeGreaterThanOrEqual(2);

	const renewalInvoice = invoices.data[0];
	expect(renewalInvoice).toBeDefined();

	const payments = renewalInvoice.payments;
	const firstPayment = payments?.data?.[0];

	const paymentObject = firstPayment?.payment as { payment_intent?: string };
	const paymentIntentId = paymentObject?.payment_intent;

	expect(paymentIntentId).toBeDefined();

	const paymentIntent = await ctx.stripeCli.paymentIntents.retrieve(
		paymentIntentId as string,
	);

	expect(paymentIntent.receipt_email).toBe(testEmail);
});
test(`${chalk.yellowBright("invoice.paid: does NOT send email receipt when send_email_receipts is false")}`, async () => {
	const customerId = "inv-paid-email-receipt-disabled";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

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

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await timeout(8000);

	const invoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId!,
		status: "paid",
		limit: 10,
		expand: ["data.payments"],
	});

	expect(invoices.data.length).toBeGreaterThanOrEqual(2);

	const renewalInvoice = invoices.data[0];
	expect(renewalInvoice).toBeDefined();

	const payments = renewalInvoice.payments;
	const firstPayment = payments?.data?.[0];

	const paymentObject = firstPayment?.payment as { payment_intent?: string };
	const paymentIntentId = paymentObject?.payment_intent;

	expect(paymentIntentId).toBeDefined();

	const paymentIntent = await ctx.stripeCli.paymentIntents.retrieve(
		paymentIntentId as string,
	);

	expect(paymentIntent.receipt_email).toBeNull();
});
test(`${chalk.yellowBright("invoice.paid: does NOT send email receipt when customer has no email")}`, async () => {
	const customerId = "inv-paid-email-receipt-no-email";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { ctx, customer, testClockId, autumnV1 } = await initScenario({
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

	await autumnV1.customers.update(customerId, {
		send_email_receipts: true,
	});

	await ctx.stripeCli.customers.update(stripeCustomerId!, {
		email: "",
	});

	await timeout(1000);

	const updatedCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	expect(updatedCustomer.send_email_receipts).toBe(true);

	const stripeCustomer = await ctx.stripeCli.customers.retrieve(
		stripeCustomerId!,
	);
	if (!stripeCustomer.deleted) {
		expect(stripeCustomer.email).toBeNull();
	}

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await timeout(8000);

	const invoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId!,
		status: "paid",
		limit: 10,
		expand: ["data.payments"],
	});

	expect(invoices.data.length).toBeGreaterThanOrEqual(2);

	const renewalInvoice = invoices.data[0];
	expect(renewalInvoice).toBeDefined();

	const payments = renewalInvoice.payments;
	const firstPayment = payments?.data?.[0];

	const paymentObject = firstPayment?.payment as { payment_intent?: string };
	const paymentIntentId = paymentObject?.payment_intent;

	expect(paymentIntentId).toBeDefined();

	const paymentIntent = await ctx.stripeCli.paymentIntents.retrieve(
		paymentIntentId as string,
	);

	expect(paymentIntent.receipt_email).toBeNull();
});
