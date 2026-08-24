import { expect } from "bun:test";

export const expectInvoicePlanIdsCorrect = ({
	invoices,
	stripeId,
	planIds,
}: {
	invoices: Array<{ stripe_id: string; plan_ids: string[] }>;
	stripeId: string;
	planIds: string[];
}) => {
	const invoice = invoices.find((row) => row.stripe_id === stripeId);
	expect(invoice, `missing invoice ${stripeId}`).toBeDefined();
	expect(
		[...(invoice?.plan_ids ?? [])].sort(),
		`plan_ids=${JSON.stringify(invoice?.plan_ids)}`,
	).toEqual([...planIds].sort());
};
