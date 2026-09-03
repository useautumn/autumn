import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

/**
 * Mid-cycle annual -> monthly switch, where the unused annual time goes back to
 * the card instead of sitting as credit on the customer's Stripe balance.
 */

const getLatestInvoice = ({ customer }: { customer: ApiCustomerV3 }) => {
	const invoice = customer.invoices?.[0];
	if (!invoice) {
		throw new Error("Expected customer to have an invoice");
	}
	return invoice;
};

test(`${chalk.yellowBright("attach annual -> monthly: refunds prorated credit to payment method")}`, async () => {
	const customerId = "attach-refund-instead-of-credit";

	const proAnnual = products.proAnnual({ id: "pro-annual-refund", items: [] });
	const proMonthly = products.pro({ id: "pro-monthly-refund", items: [] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, proMonthly] }),
		],
		actions: [
			s.attach({ productId: proAnnual.id }),
			// Halfway through the year, so roughly half the $200 is unused.
			s.advanceTestClock({ days: 182 }),
		],
	});

	const customerOnAnnual =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const annualInvoice = getLatestInvoice({ customer: customerOnAnnual });
	expect(annualInvoice.total).toBe(200);

	const switchWithRefund = {
		customer_id: customerId,
		product_id: proMonthly.id,
		plan_schedule: "immediate" as const,
		refund_last_payment: "prorated" as const,
	};

	const preview = await autumnV1.billing.previewAttach(switchWithRefund);

	console.log(
		chalk.cyan("preview.total"),
		preview.total,
		chalk.cyan("preview.refund"),
		JSON.stringify(preview.refund),
	);

	// Unused annual time leaves as cash, so it is no longer a credit line.
	expect(preview.refund).toBeDefined();
	expect(preview.refund?.amount).toBeGreaterThan(0);
	expect(preview.refund?.invoice.stripe_id).toBe(annualInvoice.stripe_id);

	await autumnV1.billing.attach(switchWithRefund);

	const customerAfterSwitch =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const stripeCustomer = await ctx.stripeCli.customers.retrieve(
		customerAfterSwitch.stripe_id as string,
	);
	// The whole point: money went back to the card, not onto the credit balance.
	expect((stripeCustomer as { balance: number }).balance).toBe(0);

	const refundedAnnualInvoice = await InvoiceService.getByStripeId({
		db: ctx.db,
		stripeId: annualInvoice.stripe_id,
	});

	console.log(
		chalk.cyan("refunded_amount"),
		refundedAnnualInvoice?.refunded_amount,
	);

	// Stripe refunds whole cents, so the preview's exact proration is rounded.
	expect(refundedAnnualInvoice?.refunded_amount).toBeGreaterThan(0);
	expect(refundedAnnualInvoice?.refunded_amount).toBeCloseTo(
		preview.refund?.amount,
		2,
	);
});
