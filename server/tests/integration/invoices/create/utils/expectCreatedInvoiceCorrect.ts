import { expect } from "bun:test";
import type {
	ApiListInvoiceV1,
	CreateInvoiceParamsInput,
	CreateInvoiceResponse,
} from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";

type Client = Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
type Ctx = Awaited<ReturnType<typeof initScenario>>["ctx"];

export const createInvoice = ({
	autumnV2_3,
	params,
}: {
	autumnV2_3: Client;
	params: CreateInvoiceParamsInput;
}) =>
	autumnV2_3.post("/invoices.create", params) as Promise<CreateInvoiceResponse>;

type ExpectedLine = {
	description?: string | RegExp;
	amount: number;
	quantity?: number | null;
	prorated?: boolean;
};

/**
 * Asserts a created invoice against the Stripe invoice it produced and the
 * Autumn row. `lines` are matched in order of the preview.
 */
export const expectCreatedInvoiceCorrect = async ({
	ctx,
	response,
	lines,
	total,
	status = "open",
	footer,
	dueInDays,
	stripeDiscountTotal,
}: {
	ctx: Ctx;
	response: CreateInvoiceResponse;
	lines: ExpectedLine[];
	total: number;
	status?: "open" | "paid";
	footer?: string;
	dueInDays?: number;
	stripeDiscountTotal?: number;
}): Promise<{ stripeInvoice: Stripe.Invoice; invoice: ApiListInvoiceV1 }> => {
	const { invoice, preview } = response;
	expect(invoice).not.toBeNull();
	if (!invoice) throw new Error("no invoice");

	expect(preview.lines.length).toBe(lines.length);
	lines.forEach((expected, index) => {
		const line = preview.lines[index];
		expect(line.amount).toBeCloseTo(expected.amount, 2);
		if (expected.description instanceof RegExp) {
			expect(line.description).toMatch(expected.description);
		} else if (expected.description) {
			expect(line.description).toBe(expected.description);
		}
		if (expected.quantity !== undefined)
			expect(line.quantity).toBe(expected.quantity);
		if (expected.prorated !== undefined)
			expect(line.prorated).toBe(expected.prorated);
	});
	expect(preview.total).toBeCloseTo(total, 2);

	expect(invoice.status).toBe(status);
	expect(invoice.total).toBeCloseTo(total, 2);

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		invoice.stripe_id,
		{
			expand: ["total_discount_amounts"],
		},
	);
	expect(stripeInvoice.status).toBe(status);
	expect(stripeInvoice.collection_method).toBe("send_invoice");
	expect(stripeInvoice.auto_advance).toBe(true);
	expect(stripeInvoice.total / 100).toBeCloseTo(total, 2);
	expect(stripeInvoice.lines.data.length).toBe(lines.length);
	if (footer !== undefined) expect(stripeInvoice.footer).toBe(footer);
	if (dueInDays !== undefined && stripeInvoice.due_date) {
		const days = (stripeInvoice.due_date * 1000 - Date.now()) / 86_400_000;
		expect(Math.round(days)).toBe(dueInDays);
	}
	if (stripeDiscountTotal !== undefined) {
		const discounted = (stripeInvoice.total_discount_amounts ?? []).reduce(
			(sum, discount) => sum + discount.amount,
			0,
		);
		expect(discounted / 100).toBeCloseTo(stripeDiscountTotal, 2);
	}

	return { stripeInvoice, invoice };
};
