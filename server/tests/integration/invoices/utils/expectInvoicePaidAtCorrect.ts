import { expect } from "bun:test";
import { invoices, secondsToMs } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { eq } from "drizzle-orm";

/** Polls our invoice row until `paid_at` matches Stripe's `status_transitions.paid_at` (null while unpaid). */
export const expectInvoicePaidAtCorrect = async ({
	stripeInvoiceId,
}: {
	stripeInvoiceId: string;
}) => {
	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(stripeInvoiceId);
	const stripePaidAtSeconds = stripeInvoice.status_transitions.paid_at;
	const expectedPaidAt = stripePaidAtSeconds
		? secondsToMs(stripePaidAtSeconds)
		: null;

	await pollUntilAsserted({
		fetch: async () => {
			const [row] = await ctx.db
				.select({ paidAt: invoices.paid_at, createdAt: invoices.created_at })
				.from(invoices)
				.where(eq(invoices.stripe_id, stripeInvoiceId));
			return row;
		},
		assert: (row) => {
			expect(row).toBeDefined();
			expect(row?.paidAt ?? null).toBe(expectedPaidAt);
			// Same unit as created_at (ms): a seconds value would sort before creation.
			if (row?.paidAt != null) {
				expect(row.paidAt).toBeGreaterThanOrEqual(row.createdAt);
			}
		},
	});

	return { stripeInvoice, expectedPaidAt };
};
