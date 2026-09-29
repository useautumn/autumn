import { ListInvoicesParamsSchema } from "@autumn/shared/publicApiSchemas";
import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import { getAutumnAuth } from "../server/auth/auth.js";
import { mcpAnnotations } from "./utils/annotations.js";
import { createDomainTools } from "./utils/builders.js";
import { callAutumnGet } from "./utils/client.js";
import type { ToolDomain } from "./utils/types.js";

const endpoints = {
	listInvoices: "/v1/invoices.list",
} as const;

const schemas = {
	listInvoices: ListInvoicesParamsSchema,
} as const;

const { operation } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "listInvoices",
			description:
				"List invoices Autumn has recorded, newest first. Filter by customer_id (plus entity_id), stripe_id (a Stripe in_... invoice ID), status (draft, open, paid, void, uncollectible), or processor_types. Stripe invoice numbers (e.g. ABCD1234-0003) are not stored, so ask for the in_... ID or list the customer's invoices instead. Status mirrors Stripe: a failed payment leaves the invoice open. To see why an invoice is unpaid, call getStripeInvoice with its stripe_id. For every/all requests, paginate with start_cursor until next_cursor is null.",
		}),
	],
} satisfies ToolDomain;

const paymentErrorSchema = z.object({
	type: z.string().nullish(),
	code: z.string().nullish(),
	decline_code: z.string().nullish(),
	message: z.string().nullish(),
});

const paymentIntentSchema = z.object({
	id: z.string(),
	status: z.string().nullish(),
	last_payment_error: paymentErrorSchema.nullish(),
});

/** Payment-status projection of a Stripe invoice; zod drops every other field. */
const stripeInvoiceSummarySchema = z.object({
	id: z.string(),
	number: z.string().nullish(),
	status: z.string().nullish(),
	collection_method: z.string().nullish(),
	billing_reason: z.string().nullish(),
	currency: z.string().nullish(),
	total: z.number().nullish(),
	amount_due: z.number().nullish(),
	amount_paid: z.number().nullish(),
	amount_remaining: z.number().nullish(),
	attempted: z.boolean().nullish(),
	attempt_count: z.number().nullish(),
	next_payment_attempt: z.number().nullish(),
	auto_advance: z.boolean().nullish(),
	due_date: z.number().nullish(),
	created: z.number().nullish(),
	hosted_invoice_url: z.string().nullish(),
	customer: z
		.union([
			z.string(),
			z.object({
				id: z.string(),
				email: z.string().nullish(),
				name: z.string().nullish(),
			}),
		])
		.nullish(),
	status_transitions: z.record(z.string(), z.number().nullable()).nullish(),
	last_finalization_error: paymentErrorSchema.nullish(),
	payments: z
		.object({
			data: z.array(
				z.object({
					status: z.string().nullish(),
					payment: z
						.object({
							type: z.string().nullish(),
							payment_intent: z
								.union([z.string(), paymentIntentSchema])
								.nullish(),
						})
						.nullish(),
				}),
			),
		})
		.nullish(),
});

export const summarizeStripeInvoice = (stripeInvoice: unknown) =>
	stripeInvoiceSummarySchema.parse(stripeInvoice);

const getStripeInvoiceSchema = z
	.object({
		stripe_invoice_id: z
			.string()
			.regex(/^in_[A-Za-z0-9]+$/, "Must be a Stripe invoice ID (in_...)")
			.meta({ description: "The Stripe invoice ID (in_...)." }),
	})
	.strict();

const signalOf = (context: { mcp?: { extra?: { signal?: AbortSignal } } }) =>
	context?.mcp?.extra?.signal;

/** Built per toolset: the intent and analytics layers mutate tools in place. */
export const createInvoiceTools = () => ({
	getStripeInvoice: createTool({
		id: "getStripeInvoice",
		description:
			"Fetch the live payment state of one invoice from Stripe by its in_... ID (from listInvoices or getCustomer invoices). Returns status, collection_method, attempt_count, next_payment_attempt, and each payment's payment_intent with last_payment_error (decline code and message). Use it to explain why an invoice is open or unpaid: a last_payment_error means a charge was attempted and failed; collection_method send_invoice means it waits for the customer to pay manually.",
		inputSchema: getStripeInvoiceSchema,
		mcp: { annotations: mcpAnnotations() },
		execute: async ({ stripe_invoice_id }, context) =>
			summarizeStripeInvoice(
				await callAutumnGet({
					auth: getAutumnAuth(context),
					endpoint: `/v1/invoices/${stripe_invoice_id}/stripe`,
					signal: signalOf(context),
				}),
			),
	}),
});

export const invoices = { endpoints, schemas, domain };
