import { expect } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	CustomerExpand,
	sumValues,
} from "@autumn/shared";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const waitForDraftUsageLines = ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}) =>
	pollUntilAsserted({
		fetch: () =>
			stripeCli.invoices.list({
				customer: stripeCustomerId,
				status: "draft",
				limit: 1,
				expand: ["data.lines"],
			}),
		assert: ({ data: [draft] }) => {
			const autumnLines = draft?.lines.data.filter(
				(line) => line.metadata?.autumn_line_item_id,
			);
			expect(autumnLines?.length ?? 0).toBeGreaterThan(0);
		},
		timeoutMs: 60_000,
	});

/**
 * Reads the upcoming invoice preview, advances one cycle, and asserts the renewal
 * invoice Stripe issued has the same total. Returns both for further checks.
 */
export const expectNextInvoiceMatchesPreview = async ({
	ctx,
	autumnV1,
	autumnV2_2,
	customerId,
	testClockId,
	advancedTo,
	featureId,
	expectedFeatureAmount,
}: {
	ctx: { stripeCli: Stripe };
	autumnV1: AutumnInt;
	autumnV2_2: AutumnInt;
	customerId: string;
	testClockId: string;
	advancedTo: number;
	featureId?: string;
	expectedFeatureAmount?: number;
}) => {
	const { invoice_previews } = await autumnV2_2.customers.get<ApiCustomerV5>(
		customerId,
		{ expand: [CustomerExpand.InvoicePreviews] },
	);
	expect(invoice_previews).toHaveLength(1);
	const [preview] = invoice_previews!;

	if (featureId && expectedFeatureAmount !== undefined) {
		const featureSubtotal = sumValues(
			preview.line_items
				.filter((lineItem) => lineItem.feature_id === featureId)
				.map((lineItem) => lineItem.subtotal),
		);
		expect(featureSubtotal).toBeCloseTo(expectedFeatureAmount, 2);
	}
	const expectsUsageLines = preview.line_items.some(
		(lineItem) => lineItem.feature_id !== null && lineItem.subtotal !== 0,
	);

	const before = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = before.invoices?.length ?? 0;

	// Stop at the cycle boundary until invoice.created has added the usage lines.
	const cycleEnd = addMonths(new Date(advancedTo), 1);
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId,
		advanceTo: cycleEnd.getTime(),
		waitForSeconds: 15,
	});
	if (expectsUsageLines && before.stripe_id) {
		await waitForDraftUsageLines({
			stripeCli: ctx.stripeCli,
			stripeCustomerId: before.stripe_id,
		});
	}
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId,
		advanceTo: addHours(cycleEnd, hoursToFinalizeInvoice).getTime(),
		waitForSeconds: 15,
	});

	// Autumn stores the renewal from Stripe webhooks, which can lag the test clock.
	const after = await pollUntilAsserted({
		fetch: () => autumnV1.customers.get<ApiCustomerV3>(customerId),
		assert: (customer) => {
			expect(customer.invoices?.length).toBe(invoiceCountBefore + 1);
			expect(customer.invoices![0].total).toBeCloseTo(preview.total, 2);
		},
		timeoutMs: 60_000,
	});
	const renewalInvoice = after.invoices![0];

	return { preview, renewalInvoice };
};
