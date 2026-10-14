import { expect } from "bun:test";
import { type ApiCustomerV5, stripeToAtmnAmount } from "@autumn/shared";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import type Stripe from "stripe";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export type ExpectedUsageInvoiceLine = {
	description: string;
	amount: number;
	quantity: number;
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

const byDescription = <T extends { description: string | null }>(lines: T[]) =>
	[...lines].sort((a, b) =>
		(a.description ?? "").localeCompare(b.description ?? ""),
	);

const toExpectedPrefix = ({
	description,
	expected,
}: {
	description: string | null;
	expected?: string;
}) =>
	expected !== undefined && description?.startsWith(expected)
		? expected
		: description;

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
	const expected = byDescription(
		expectedLines.map(({ previewQuantity: _, ...line }) => line),
	);

	expect(
		byDescription(autumnLines).map((line, index) => ({
			description: toExpectedPrefix({
				description: line.description,
				expected: expected[index]?.description,
			}),
			amount: stripeToAtmnAmount({
				amount: line.amount,
				currency: line.currency,
			}),
			quantity: line.quantity,
		})),
	).toEqual(expected);
	return autumnLines;
};

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
		waitForUsageLines: expectedLines.length > 0,
	});

	const stripeLines = await listStripeInvoiceLines({
		stripeCli: ctx.stripeCli,
		invoiceId: renewalInvoice.stripe_id,
	});
	expectStripeUsageLines({ stripeLines, expectedLines });

	const previewLines = preview.line_items.filter(
		(line: PreviewLineItem) => line.feature_id !== null,
	);
	const expectedPreviewLines = byDescription(
		expectedLines.map(({ description, amount, quantity, previewQuantity }) => ({
			description,
			amount,
			quantity: previewQuantity ?? quantity,
		})),
	);
	expect(
		byDescription(
			previewLines.map((line: PreviewLineItem) => ({
				description: line.description,
				amount: line.subtotal,
				quantity: line.quantity,
			})),
		).map((line, index) => ({
			...line,
			description: toExpectedPrefix({
				description: line.description,
				expected: expectedPreviewLines[index]?.description,
			}),
		})),
	).toEqual(expectedPreviewLines);
};
