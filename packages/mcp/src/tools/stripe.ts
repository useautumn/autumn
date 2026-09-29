import * as z from "zod/v4";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const stripeReadSchema = z
	.object({
		path: z
			.string()
			.min(1)
			.describe(
				'Stripe API path starting with /v1/ or /v2/, e.g. "/v1/subscriptions". No host or query string.',
			),
		params: z
			.record(z.string(), z.unknown())
			.optional()
			.describe(
				"Query params (filters, limit, expand), sent as the GET query string.",
			),
		maxPages: z
			.number()
			.int()
			.min(1)
			.max(10)
			.optional()
			.describe(
				"Pages to auto-paginate for list endpoints (default 1, max 10).",
			),
	})
	.strict()
	.transform(({ maxPages, ...request }) => ({
		...request,
		...(maxPages === undefined ? {} : { max_pages: maxPages }),
	}));

const searchStripeEndpointsSchema = z
	.object({
		query: z
			.string()
			.min(1)
			.max(500)
			.describe('Keywords, e.g. "subscription schedule" or "invoice items".'),
		limit: z.number().int().min(1).max(50).optional(),
	})
	.strict();

const endpoints = {
	stripeRead: "/v1/stripe.get",
	searchStripeEndpoints: "/v1/stripe.search_endpoints",
} as const;

const schemas = {
	stripeRead: stripeReadSchema,
	searchStripeEndpoints: searchStripeEndpointsSchema,
} as const;

const { operation } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "stripeRead",
			description:
				"GET-only Stripe read for the caller's org's connected Stripe account (Autumn issues the request; no Stripe key is exposed). Discover endpoints and their query params with searchStripeEndpoints first. List endpoints auto-paginate up to maxPages. Some endpoints (connected accounts, transfers, application fees, app secrets, file contents, quote PDFs) are blocked and secrets are redacted. Previews and any writes must go through Autumn tools, never Stripe.",
		}),
		operation({
			id: "searchStripeEndpoints",
			description:
				"Search Stripe's API reference for GET endpoints readable via stripeRead. Returns matching paths, summaries, and query params. Read-only discovery; previews and any writes must go through Autumn tools, not Stripe.",
		}),
	],
} satisfies ToolDomain;

export const stripe = { endpoints, schemas, domain };
