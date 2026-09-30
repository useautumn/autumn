import { expect } from "bun:test";
import type {
	ApiListInvoiceV1,
	AttachParamsV1Input,
	CreateInvoicePreview,
	InvoiceIssueMethod,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";

type Scenario = Awaited<ReturnType<typeof initScenario>>;

export type ReissueResponse = {
	invoice: ApiListInvoiceV1;
	voided_invoice_id: string | null;
	credit_note_id: string | null;
	preview: CreateInvoicePreview;
};

export const listInvoices = async ({
	autumnV2_3,
	customerId,
}: {
	autumnV2_3: Scenario["autumnV2_3"];
	customerId: string;
}) =>
	(
		(await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as { list: ApiListInvoiceV1[] }
	).list;

/** Attaches in invoice mode; `finalize: false` leaves the invoice as a draft. */
export const attachInvoiceModePlan = async ({
	autumnV2_3,
	autumnV2_4,
	customerId,
	planId,
	finalize,
}: {
	autumnV2_3: Scenario["autumnV2_3"];
	autumnV2_4: Scenario["autumnV2_4"];
	customerId: string;
	planId: string;
	finalize: boolean;
}) => {
	await autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
		invoice_mode: {
			enabled: true,
			finalize,
			enable_plan_immediately: false,
			net_terms_days: 7,
		},
	});
	const [original] = await listInvoices({ autumnV2_3, customerId });
	return original;
};

const EXPECTED_STRIPE_STATE: Record<
	InvoiceIssueMethod,
	{ status: Stripe.Invoice.Status; autoAdvance: boolean }
> = {
	draft: { status: "draft", autoAdvance: false },
	finalize: { status: "open", autoAdvance: false },
	send: { status: "open", autoAdvance: true },
};

/** Asserts the Stripe invoice and its Autumn row reflect the issue method. */
export const expectIssuedAs = async ({
	invoice,
	issueMethod,
}: {
	invoice: ApiListInvoiceV1;
	issueMethod: InvoiceIssueMethod;
}) => {
	const expected = EXPECTED_STRIPE_STATE[issueMethod];
	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		invoice.stripe_id,
	);
	expect(stripeInvoice.status).toBe(expected.status);
	expect(stripeInvoice.auto_advance).toBe(expected.autoAdvance);
	expect(invoice.status).toBe(expected.status);
	return stripeInvoice;
};
