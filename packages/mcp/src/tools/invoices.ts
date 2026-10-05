import {
	CreateInvoiceParamsSchema,
	FinalizeInvoiceParamsSchema,
	IssueCreditNoteParamsSchema,
	ListInvoicesParamsSchema,
	ListInvoiceTemplatesParamsSchema,
	PayInvoiceParamsSchema,
	ReissueInvoiceParamsSchema,
	VoidInvoiceParamsSchema,
} from "@autumn/shared/publicApiSchemas";
import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import { getAutumnAuth } from "../server/auth/auth.js";
import { mcpAnnotations } from "./utils/annotations.js";
import { createDomainTools } from "./utils/builders.js";
import { callAutumn } from "./utils/client.js";
import type { OperationToolConfig, ToolDomain } from "./utils/types.js";

// Create and reissue preview through a `preview` flag on the write endpoint.
// The tools own that flag, so the preview and the write take one identical
// request (the server still validates the full schema, refinements included).
const createInvoiceRequestSchema = CreateInvoiceParamsSchema.omit({
	preview: true,
});
const reissueInvoiceRequestSchema = ReissueInvoiceParamsSchema.omit({
	preview: true,
});
const issueCreditNoteRequestSchema = IssueCreditNoteParamsSchema.omit({
	preview: true,
});

const endpoints = {
	listInvoices: "/v1/invoices.list",
	listInvoiceTemplates: "/v1/invoices.listTemplates",
	previewCreateInvoice: "/v1/invoices.create",
	createInvoice: "/v1/invoices.create",
	previewReissueInvoice: "/v1/invoices.reissue",
	reissueInvoice: "/v1/invoices.reissue",
	previewIssueCreditNote: "/v1/invoices.issue_credit_note",
	issueCreditNote: "/v1/invoices.issue_credit_note",
	finalizeInvoice: "/v1/invoices.finalize",
	payInvoice: "/v1/invoices.pay",
	voidInvoice: "/v1/invoices.void",
} as const;

const schemas = {
	listInvoices: ListInvoicesParamsSchema,
	listInvoiceTemplates: ListInvoiceTemplatesParamsSchema,
	previewCreateInvoice: createInvoiceRequestSchema,
	createInvoice: createInvoiceRequestSchema,
	previewReissueInvoice: reissueInvoiceRequestSchema,
	reissueInvoice: reissueInvoiceRequestSchema,
	previewIssueCreditNote: issueCreditNoteRequestSchema,
	issueCreditNote: issueCreditNoteRequestSchema,
	finalizeInvoice: FinalizeInvoiceParamsSchema,
	payInvoice: PayInvoiceParamsSchema,
	voidInvoice: VoidInvoiceParamsSchema,
} as const;

const { operation, confirmedWrite } = createDomainTools({ endpoints, schemas });

const PREVIEW_FIELDS = { preview: true };
const WRITE_FIELDS = { preview: false };

const INVOICE_ID_NOTE =
	"invoice_id is the Autumn invoice ID (the id from listInvoices, e.g. inv_...), not the Stripe in_... ID.";

const withFixedFields = (
	config: OperationToolConfig,
	fixedFields: Record<string, unknown>,
): OperationToolConfig => ({ ...config, fixedFields });

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/** Keeps only invoices matching the ID filters. An API build that predates a
 * filter silently drops it and returns unrelated invoices; this turns that into
 * an empty result instead of a wrong match. */
export const keepInvoicesMatchingIdFilters = ({
	request,
	result,
}: {
	request: unknown;
	result: unknown;
}) => {
	const { invoice_id: invoiceId, stripe_id: stripeId } = asRecord(request);
	const body = asRecord(result);
	if (!Array.isArray(body.list) || (!invoiceId && !stripeId)) return result;

	const list = body.list.filter((invoice) => {
		const { id, stripe_id: invoiceStripeId } = asRecord(invoice);
		return (
			(!invoiceId || id === invoiceId) &&
			(!stripeId || invoiceStripeId === stripeId)
		);
	});
	if (list.length === body.list.length) return result;
	return { ...body, list, next_cursor: null };
};

const domain = {
	operations: [
		{
			...operation({
				id: "listInvoices",
				description:
					'List invoices Autumn has recorded, newest first. Filter by customer_id (plus entity_id), invoice_id (Autumn inv_...), stripe_id (Stripe in_...), status (draft, open, paid, void, uncollectible), or processor_types. There is no filter for a Stripe invoice number (e.g. ABCD1234-0003): find it in Stripe with GET /v1/invoices/search and query number:"ABCD1234-0003", then filter by the id it returns as stripe_id. Status mirrors Stripe: a failed payment leaves the invoice open. To see why an invoice is unpaid, read the Stripe invoice (GET /v1/invoices/{stripe_id} with expand payments.data.payment.payment_intent) and check last_payment_error. For every/all requests, paginate with start_cursor until next_cursor is null.',
			}),
			transformResult: keepInvoicesMatchingIdFilters,
		},
		operation({
			id: "listInvoiceTemplates",
			description:
				"List the organization's invoice templates (footer, memo and default payment terms). Pass a template's id as invoice_template_id to createInvoice or reissueInvoice.",
		}),
		withFixedFields(
			operation({
				id: "previewCreateInvoice",
				description:
					"Preview a one-off invoice for a customer without creating it: returns the lines, discounts, tax and totals. Charge catalog plans (plans[], with feature_quantities / license_quantities and pricing customize) and/or custom_line_items. Always preview the exact final request before createInvoice.",
			}),
			PREVIEW_FIELDS,
		),
		withFixedFields(
			operation({
				id: "previewReissueInvoice",
				description: `Preview reissuing an invoice without changing anything: returns the replacement's lines and totals. Reissue voids an open original (or credits a paid one) and issues a replacement with the requested changes: lines add/update/remove, invoice overrides (tax, custom fields, memo, footer, payment methods), customer billing details, net_terms_days, or a template. ${INVOICE_ID_NOTE} Always preview the exact final request before reissueInvoice.`,
			}),
			PREVIEW_FIELDS,
		),
		withFixedFields(
			operation({
				id: "previewIssueCreditNote",
				description: `Preview a credit note on an open or paid invoice without issuing it: returns its total, discount, tax and where the money goes. Credit a flat amount or specific lines (line ids are the invoice_li_... ids from the invoice's items; line amounts are pre-discount and pre-tax like the item amounts). On a paid invoice, destination picks where the paid money goes: customer_balance (default), refund, or out_of_band. Draft and void invoices cannot be credited. ${INVOICE_ID_NOTE} Always preview the exact final request before issueCreditNote.`,
			}),
			PREVIEW_FIELDS,
		),
		operation({
			id: "finalizeInvoice",
			description: `Finalize a draft invoice so Stripe issues it: a send-invoice one is emailed to the customer, a charge-automatically one is charged. Only draft invoices can be finalized. ${INVOICE_ID_NOTE} Destructive billing write: confirm the invoice with the user first.`,
			destructive: true,
		}),
		operation({
			id: "payInvoice",
			description: `Mark an open invoice as paid out of band (e.g. paid by bank transfer or cheque outside Stripe). Nothing is charged. ${INVOICE_ID_NOTE} Destructive billing write: confirm the invoice with the user first.`,
			destructive: true,
		}),
		operation({
			id: "voidInvoice",
			description: `Void an open or uncollectible invoice so the customer no longer owes it. Paid invoices cannot be voided; use reissueInvoice to correct one. ${INVOICE_ID_NOTE} Destructive billing write: confirm the invoice with the user first.`,
			destructive: true,
		}),
	],
	confirmedWrites: [
		withFixedFields(
			confirmedWrite({
				id: "createInvoice",
				description:
					"Create and issue a one-off invoice with the exact request previewed by previewCreateInvoice.",
			}),
			WRITE_FIELDS,
		),
		withFixedFields(
			confirmedWrite({
				id: "reissueInvoice",
				description:
					"Void (or credit) an invoice and issue its replacement with the exact request previewed by previewReissueInvoice.",
			}),
			WRITE_FIELDS,
		),
		withFixedFields(
			confirmedWrite({
				id: "issueCreditNote",
				description:
					"Issue a credit note with the exact request previewed by previewIssueCreditNote. A refund destination returns real money to the customer's payment method.",
			}),
			WRITE_FIELDS,
		),
	],
} satisfies ToolDomain;

const signalOf = (context: { mcp?: { extra?: { signal?: AbortSignal } } }) =>
	context?.mcp?.extra?.signal;

const getInvoiceSchema = z
	.object({
		invoice_id: z.string().meta({
			description: "The Autumn invoice ID (inv_...).",
		}),
	})
	.strict();

const invoiceListSchema = z.object({ list: z.array(z.unknown()) });

/** One invoice by its Autumn ID. It takes the same request as voidInvoice,
 * payInvoice and finalizeInvoice, so it doubles as their approval preview. */
const getInvoice = async ({
	auth,
	invoiceId,
	signal,
}: {
	auth: ReturnType<typeof getAutumnAuth>;
	invoiceId: string;
	signal?: AbortSignal;
}) => {
	const { list } = invoiceListSchema.parse(
		await callAutumn({
			auth,
			endpoint: "/v1/invoices.list",
			request: { invoice_id: invoiceId, limit: 1 },
			retryable: true,
			signal,
		}),
	);
	const invoice = list.find((row) => asRecord(row).id === invoiceId);
	if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
	return invoice;
};

/** Built per toolset: the intent and analytics layers mutate tools in place. */
export const createInvoiceTools = () => ({
	getInvoice: createTool({
		id: "getInvoice",
		description:
			"Fetch one invoice Autumn has recorded by its Autumn ID (inv_...): customer, status, total, currency, amount paid and line items.",
		inputSchema: z.object({ request: getInvoiceSchema }).strict(),
		mcp: { annotations: mcpAnnotations() },
		execute: async ({ request }, context) =>
			getInvoice({
				auth: getAutumnAuth(context),
				invoiceId: request.invoice_id,
				signal: signalOf(context),
			}),
	}),
});

export const invoices = { endpoints, schemas, domain };
