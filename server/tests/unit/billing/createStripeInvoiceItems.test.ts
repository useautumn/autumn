import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockState = {
	calls: [] as unknown[],
	inFlight: 0,
	maxInFlight: 0,
	resolvers: [] as Array<() => void>,
};

mock.module("@/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		invoiceItems: {
			create: async (item: unknown) => {
				mockState.calls.push(item);
				const callIndex = mockState.calls.length;
				mockState.inFlight += 1;
				mockState.maxInFlight = Math.max(
					mockState.maxInFlight,
					mockState.inFlight,
				);

				await new Promise<void>((resolve) => {
					mockState.resolvers.push(resolve);
				});

				mockState.inFlight -= 1;
				return { id: `ii_${callIndex}` };
			},
		},
	}),
}));

import { createStripeInvoiceItems } from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";

describe("createStripeInvoiceItems", () => {
	beforeEach(() => {
		mockState.calls = [];
		mockState.inFlight = 0;
		mockState.maxInFlight = 0;
		mockState.resolvers = [];
	});

	test("creates invoice items concurrently", async () => {
		const invoiceItems = [
			{ customer: "cus_123", amount: 100 },
			{ customer: "cus_123", amount: 200 },
			{ customer: "cus_123", amount: 300 },
		];

		const resultPromise = createStripeInvoiceItems({
			ctx: { org: { id: "org_123" }, env: "sandbox" } as never,
			invoiceItems: invoiceItems as never,
		});

		await Promise.resolve();

		expect(mockState.calls).toEqual(invoiceItems);
		expect(mockState.maxInFlight).toBe(3);

		for (const resolve of mockState.resolvers) {
			resolve();
		}
		const results = await resultPromise;

		expect(results.map((result) => result.id)).toEqual([
			"ii_1",
			"ii_2",
			"ii_3",
		]);
	});
});
