import { expect } from "bun:test";
import { type ApiCustomerV5, stripeToAtmnAmount } from "@autumn/shared";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import type Stripe from "stripe";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export type ExpectedUsageInvoiceLine = {
	description: string;
	/** Major units, e.g. 75 for $75.00. */
	amount: number;
	quantity: number;
	/** Minor units, as Stripe stores it; omitted lines skip the check. */
	unitAmountDecimal?: string;
	/** The preview's quantity when it differs from Stripe's (untiered lines report usage). */
	previewQuantity?: number;
};

type PreviewLineItem = NonNullable<
	ApiCustomerV5["invoice_previews"]
>[number]["line_items"][number];

const listStripeInvoiceLines = async ({
	stripeCli,
	invoiceId,
}: {
	stripeCli: Stripe;
	invoiceId: string;
}) => {
	const lines: Stripe.InvoiceLineItem[] = [];
	for await (const line of stripeCli.invoices.listLineItems(invoiceId, {
		limit: 100,
	})) {
		lines.push(line);
	}
	return lines;
};

/** Asserts the lines Autumn added to a Stripe invoice, in order. */
export const expectStripeUsageLines = ({
	stripeLines,
	expectedLines,
}: {
	stripeLines: Stripe.InvoiceLineItem[];
	expectedLines: ExpectedUsageInvoiceLine[];
}) => {
	const autumnLines = stripeLines.filter(
		(line) => line.metadata?.autumn_line_item_id,
	);

	expect(
		autumnLines.map((line, index) => ({
			description: line.description,
			amount: stripeToAtmnAmount({
				amount: line.amount,
				currency: line.currency,
			}),
			quantity: line.quantity,
			...(expectedLines[index]?.unitAmountDecimal !== undefined && {
				unitAmountDecimal: line.pricing?.unit_amount_decimal,
			}),
		})),
	).toEqual(expectedLines.map(({ previewQuantity: _, ...line }) => line));
	return autumnLines;
};

/**
 * Advances one cycle and asserts the lines Autumn added to the renewal invoice, then that
 * the upcoming-invoice preview listed the same lines with the same amounts and quantities.
 */
export const expectRenewalUsageLinesMatchPreview = async ({
	ctx,
	autumnV1,
	autumnV2_2,
	customerId,
	testClockId,
	advancedTo,
	expectedLines,
}: {
	ctx: { stripeCli: Stripe };
	autumnV1: AutumnInt;
	autumnV2_2: AutumnInt;
	customerId: string;
	testClockId: string;
	advancedTo: number;
	expectedLines: ExpectedUsageInvoiceLine[];
}) => {
	const { preview, renewalInvoice } = await expectNextInvoiceMatchesPreview({
		ctx,
		autumnV1,
		autumnV2_2,
		customerId,
		testClockId,
		advancedTo,
	});

	const stripeLines = await listStripeInvoiceLines({
		stripeCli: ctx.stripeCli,
		invoiceId: renewalInvoice.stripe_id,
	});
	expectStripeUsageLines({ stripeLines, expectedLines });

	// Usage and credit lines carry a feature; base prices don't.
	const previewLines = preview.line_items.filter(
		(line: PreviewLineItem) => line.feature_id !== null,
	);
	expect(
		previewLines.map((line: PreviewLineItem) => ({
			description: line.description,
			amount: line.subtotal,
			quantity: line.quantity,
		})),
	).toEqual(
		expectedLines.map(({ description, amount, quantity, previewQuantity }) => ({
			description,
			amount,
			quantity: previewQuantity ?? quantity,
		})),
	);
};
