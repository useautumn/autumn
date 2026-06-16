import { beforeEach, describe, expect, mock, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";

const updateFromStripeCalls: string[] = [];

mock.module("@/internal/invoices/actions", () => ({
	invoiceActions: {
		updateFromStripe: async ({
			stripeInvoice,
		}: {
			stripeInvoice: Stripe.Invoice;
		}) => {
			updateFromStripeCalls.push(stripeInvoice.id);
		},
	},
}));

const { voidOpenInvoicesForStripeSubscription } = await import(
	"@/external/stripe/invoices/operations/voidOpenInvoicesForStripeSubscription"
);

const ctx = {
	logger: { info: () => {}, warn: () => {}, error: () => {} },
} as never;

const inv = (id: string, status: Stripe.Invoice.Status) =>
	({ id, status }) as Stripe.Invoice;

type Page = { data: Stripe.Invoice[]; has_more: boolean };

const fakeStripe = ({
	pages,
	failVoidIds = [],
}: {
	pages: Page[];
	failVoidIds?: string[];
}) => {
	const listCalls: Stripe.InvoiceListParams[] = [];
	const voided: string[] = [];
	let pageIndex = 0;

	const stripeCli = {
		invoices: {
			list: async (params: Stripe.InvoiceListParams) => {
				listCalls.push(params);
				return pages[pageIndex++] ?? { data: [], has_more: false };
			},
			voidInvoice: async (id: string) => {
				if (failVoidIds.includes(id)) throw new Error(`cannot void ${id}`);
				voided.push(id);
				return inv(id, "void");
			},
		},
	} as unknown as Stripe;

	return { stripeCli, listCalls, voided };
};

const run = (stripeCli: Stripe) =>
	voidOpenInvoicesForStripeSubscription({
		ctx,
		stripeCli,
		customerId: "cus_internal",
		stripeCustomerId: "cus_stripe",
		subscriptionId: "sub_123",
	});

describe(chalk.yellowBright("voidOpenInvoicesForStripeSubscription"), () => {
	beforeEach(() => {
		updateFromStripeCalls.length = 0;
	});

	test("voids only open/uncollectible invoices, leaving paid/draft untouched", async () => {
		const { stripeCli, voided } = fakeStripe({
			pages: [
				{
					data: [
						inv("inv_open", "open"),
						inv("inv_paid", "paid"),
						inv("inv_uncollectible", "uncollectible"),
						inv("inv_draft", "draft"),
					],
					has_more: false,
				},
			],
		});

		const result = await run(stripeCli);

		expect(result).toEqual({ voided: 2, failed: 0 });
		expect(voided.sort()).toEqual(["inv_open", "inv_uncollectible"]);
		expect(updateFromStripeCalls.sort()).toEqual([
			"inv_open",
			"inv_uncollectible",
		]);
	});

	test("partial void failure is counted, not thrown; success still records", async () => {
		const { stripeCli, voided } = fakeStripe({
			pages: [
				{
					data: [
						inv("inv_a", "open"),
						inv("inv_b", "uncollectible"),
						inv("inv_c", "open"),
					],
					has_more: false,
				},
			],
			failVoidIds: ["inv_b"],
		});

		const result = await run(stripeCli);

		expect(result).toEqual({ voided: 2, failed: 1 });
		expect(voided.sort()).toEqual(["inv_a", "inv_c"]);
		// The failed invoice never reaches the DB sync.
		expect(updateFromStripeCalls).not.toContain("inv_b");
		expect(updateFromStripeCalls.sort()).toEqual(["inv_a", "inv_c"]);
	});

	test("paginates past 100 invoices, threading starting_after by last id", async () => {
		const firstPage = Array.from({ length: 100 }, (_, i) =>
			inv(`inv_p1_${i}`, "open"),
		);
		const secondPage = Array.from({ length: 30 }, (_, i) =>
			inv(`inv_p2_${i}`, "open"),
		);

		const { stripeCli, listCalls, voided } = fakeStripe({
			pages: [
				{ data: firstPage, has_more: true },
				{ data: secondPage, has_more: false },
			],
		});

		const result = await run(stripeCli);

		expect(result).toEqual({ voided: 130, failed: 0 });
		expect(voided).toHaveLength(130);
		expect(listCalls).toHaveLength(2);
		expect(listCalls[0]?.starting_after).toBeUndefined();
		expect(listCalls[1]?.starting_after).toBe("inv_p1_99");
	});
});
