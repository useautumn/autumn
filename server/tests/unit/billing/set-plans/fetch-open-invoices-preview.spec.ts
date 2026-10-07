import { afterAll, describe, expect, mock, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const INVOICE_PAGES: Stripe.Invoice[][] = [
	[{ id: "in_page1" } as Stripe.Invoice],
	[{ id: "in_page2" } as Stripe.Invoice],
];

const listInvoicePage = async (params: Stripe.InvoiceListParams) => {
	const pageIndex = params.starting_after === "in_page1" ? 1 : 0;
	return {
		data: INVOICE_PAGES[pageIndex],
		has_more: pageIndex < INVOICE_PAGES.length - 1,
	};
};

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({ invoices: { list: listInvoicePage } }),
}));

const { fetchPastDueOpenInvoices } = await import(
	"@/internal/billing/v2/actions/setPlans/preview/fetchPastDueOpenInvoices"
);
const { fetchReplacedSubscriptionPreviewInputs } = await import(
	"@/internal/billing/v2/actions/setPlans/preview/fetchReplacedSubscriptionPreviewInputs"
);

const ctx = { org: { id: "org_123" }, env: "sandbox" } as AutumnContext;

describe("set_plans preview open-invoice fetches read every page", () => {
	test("past_due subscription", async () => {
		const invoices = await fetchPastDueOpenInvoices({
			ctx,
			billingContext: {
				stripeSubscription: { id: "sub_live", status: "past_due" },
			} as BillingContext,
		});

		expect(invoices.map((invoice) => invoice.id)).toEqual([
			"in_page1",
			"in_page2",
		]);
	});

	test("replaced subscription", async () => {
		const { replacedOpenInvoices } =
			await fetchReplacedSubscriptionPreviewInputs({
				ctx,
				billingContext: {
					replacedStripeSubscription: { id: "sub_old", status: "unpaid" },
				} as BillingContext,
				outgoingCustomerProducts: [],
				billedLineItems: [],
			});

		expect(replacedOpenInvoices.map((invoice) => invoice.id)).toEqual([
			"in_page1",
			"in_page2",
		]);
	});
});

afterAll(() => {
	mock.restore();
});
