import { createCursorPaginatedResponseSchema } from "@api/common/cursorPaginationSchemas.js";
import { ApiListInvoiceV1Schema } from "@api/others/apiInvoice/apiListInvoiceV1.js";
import { ListInvoicesParamsSchema } from "@api/others/apiInvoice/listInvoicesParams.js";
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
};

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
