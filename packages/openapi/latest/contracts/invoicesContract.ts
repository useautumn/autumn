import { createCursorPaginatedResponseSchema } from "@api/common/cursorPaginationSchemas.js";
import { ApiListInvoiceV1Schema } from "@api/others/apiInvoice/apiListInvoiceV1.js";
import { InsertInvoicesParamsSchema } from "@api/others/apiInvoice/insertInvoicesParams.js";
import { InsertInvoicesResponseSchema } from "@api/others/apiInvoice/insertInvoicesResponse.js";
import { ListInvoicesParamsSchema } from "@api/others/apiInvoice/listInvoicesParams.js";
import {
	PayInvoiceParamsSchema,
	PayInvoiceResponseSchema,
} from "@api/others/apiInvoice/payInvoiceParams.js";
import {
	ReissueInvoiceParamsSchema,
	ReissueInvoiceResponseSchema,
} from "@api/others/apiInvoice/reissueInvoiceParams.js";
import {
	VoidInvoiceParamsSchema,
	VoidInvoiceResponseSchema,
} from "@api/others/apiInvoice/voidInvoiceParams.js";
import { oc } from "@orpc/contract";

const LIST_INVOICE_EXAMPLE = {
	id: "inv_2b3c4d5e6f7g8h",
	customer_id: "cus_123",
	entity_id: null,
	plan_ids: ["pro_plan"],
	stripe_id: "in_1A2B3C4D5E6F7G8H",
	processor_type: "stripe",
	status: "paid",
	total: 29.99,
	amount_paid: 29.99,
	refunded_amount: 0,
	currency: "usd",
	created_at: 1759247877000,
	hosted_invoice_url: "https://invoice.stripe.com/i/acct_123/test_456",
	items: [
		{
			description: "Pro plan",
			plan_id: "pro_plan",
			feature_id: null,
			feature_name: null,
			quantity: null,
			amount: 20,
			period_start: 1759247877000,
			period_end: 1761839877000,
			entities: [],
		},
		{
			description: "AI credits",
			plan_id: "pro_plan",
			feature_id: "ai_credits",
			feature_name: "AI Credits",
			quantity: 4995,
			amount: 9.99,
			period_start: 1759247877000,
			period_end: 1761839877000,
			entities: [{ entity_id: "acme-docs-prod", quantity: 4995, amount: 9.99 }],
		},
	],
};

export const insertInvoicesContract = oc
	.route({
		method: "POST",
		path: "/v1/invoices.insert",
		operationId: "insertInvoices",
		tags: ["invoices"],
		description:
			"Inserts or updates up to 500 historical invoices without reading or mutating the billing processor.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "insert",
		}),
	})
	.input(
		InsertInvoicesParamsSchema.meta({
			title: "InsertInvoicesParams",
			examples: [
				{
					invoices: [
						{
							customer_id: "cus_123",
							plan_ids: ["pro"],
							stripe_id: "in_legacy_123",
							processor_type: "stripe",
							status: "paid",
							total: 29.99,
							amount_paid: 29.99,
							refunded_amount: 0,
							currency: "usd",
							created_at: 1451606400000,
							hosted_invoice_url:
								"https://billing.example.com/invoices/legacy-123",
						},
					],
				},
			],
		}),
	)
	.output(
		InsertInvoicesResponseSchema.meta({
			examples: [
				{
					invoices: [
						{
							id: "inv_2b3c4d5e6f7g8h",
							customer_id: "cus_123",
							plan_ids: ["pro"],
							stripe_id: "in_legacy_123",
							processor_type: "stripe",
							status: "paid",
							total: 29.99,
							amount_paid: 29.99,
							refunded_amount: 0,
							currency: "usd",
							created_at: 1451606400000,
							hosted_invoice_url:
								"https://billing.example.com/invoices/legacy-123",
						},
					],
				},
			],
		}),
	);

export const listInvoicesContract = oc
	.route({
		method: "POST",
		path: "/v1/invoices.list",
		operationId: "listInvoices",
		tags: ["invoices"],
		description:
			'Lists invoices with cursor pagination and optional filters (customer, entity, status, processor). Pass `start_cursor: ""` (or omit) for the first page; use `next_cursor` from a prior response for subsequent pages.',
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "list",
		}),
	})
	.input(
		ListInvoicesParamsSchema.meta({
			title: "ListInvoicesParams",
			examples: [
				{
					start_cursor: "",
					limit: 10,
					customer_id: "cus_123",
					status: ["open", "paid"],
				},
			],
		}),
	)
	.output(
		createCursorPaginatedResponseSchema(ApiListInvoiceV1Schema).meta({
			examples: [
				{
					list: [LIST_INVOICE_EXAMPLE],
					next_cursor: null,
				},
			],
		}),
	);

export const payInvoiceContract = oc
	.route({
		method: "POST",
		path: "/v1/invoices.pay",
		operationId: "payInvoice",
		tags: ["invoices"],
		description:
			"Marks an open Stripe invoice as paid out of band. No charge is attempted; use this when payment was collected elsewhere (e.g. a marketplace). Already-paid invoices are returned unchanged.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "pay",
		}),
	})
	.input(
		PayInvoiceParamsSchema.meta({
			title: "PayInvoiceParams",
			examples: [{ invoice_id: "inv_2b3c4d5e6f7g8h" }],
		}),
	)
	.output(
		PayInvoiceResponseSchema.meta({
			examples: [{ invoice: { ...LIST_INVOICE_EXAMPLE, status: "paid" } }],
		}),
	);

export const voidInvoiceContract = oc
	.route({
		method: "POST",
		path: "/v1/invoices.void",
		operationId: "voidInvoice",
		tags: ["invoices"],
		description:
			"Voids an open or uncollectible Stripe invoice. Any plan still waiting on the invoice to be paid expires. Voiding an unpaid subscription invoice lets Stripe re-derive the subscription status from its remaining invoices, which can move a past-due subscription back to active. Already-void invoices are returned unchanged.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "void",
		}),
	})
	.input(
		VoidInvoiceParamsSchema.meta({
			title: "VoidInvoiceParams",
			examples: [{ invoice_id: "inv_2b3c4d5e6f7g8h" }],
		}),
	)
	.output(
		VoidInvoiceResponseSchema.meta({
			examples: [{ invoice: { ...LIST_INVOICE_EXAMPLE, status: "void" } }],
		}),
	);

export const reissueInvoiceContract = oc
	.route({
		method: "POST",
		path: "/v1/invoices.reissue",
		operationId: "reissueInvoice",
		tags: ["invoices"],
		description:
			"Voids an open send-invoice Stripe invoice and issues a replacement with the same line items. An invoice template can supply the replacement's footer (e.g. bank details) and memo. The replacement keeps the original due date unless net_terms_days is passed, which is required once the original is past due. The replacement stays linked to the same subscription and fulfils the same pending plan when paid.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "reissue",
		}),
	})
	.input(
		ReissueInvoiceParamsSchema.meta({
			title: "ReissueInvoiceParams",
			examples: [
				{
					invoice_id: "inv_2b3c4d5e6f7g8h",
					invoice_template_id: "inv_tmpl_bank_transfer",
				},
			],
		}),
	)
	.output(
		ReissueInvoiceResponseSchema.meta({
			examples: [
				{
					invoice: {
						...LIST_INVOICE_EXAMPLE,
						id: "inv_3c4d5e6f7g8h9i",
						status: "open",
					},
					voided_invoice_id: "inv_2b3c4d5e6f7g8h",
				},
			],
		}),
	);
