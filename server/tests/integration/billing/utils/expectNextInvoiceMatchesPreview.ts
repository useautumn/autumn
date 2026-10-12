import { expect } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	CustomerExpand,
} from "@autumn/shared";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

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
		// Tiered prices preview one line per band, so the feature's amount is their sum.
		const featureSubtotal = preview.line_items
			.filter((lineItem) => lineItem.feature_id === featureId)
			.reduce((sum, lineItem) => sum + lineItem.subtotal, 0);
		expect(featureSubtotal).toBeCloseTo(expectedFeatureAmount, 2);
	}

	const before = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = before.invoices?.length ?? 0;

	// Pause at the cycle boundary so invoice.created adds usage lines before finalization.
	const cycleEnd = addMonths(new Date(advancedTo), 1);
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId,
		advanceTo: cycleEnd.getTime(),
		waitForSeconds: 15,
	});
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
