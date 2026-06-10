import {
	CreateCustomerParamsV1Schema,
	GetCustomerParamsV1Schema,
	ListCustomersV2_3ParamsSchema,
	UpdateCustomerParamsV1Schema,
} from "@autumn/shared/publicApiSchemas";
import * as z from "zod/v4";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const listCustomersSchema = ListCustomersV2_3ParamsSchema.extend({
	limit: z
		.preprocess(
			(value) => (typeof value === "number" && value > 1000 ? 1000 : value),
			z.number().int().positive().max(1000).optional(),
		)
		.meta({ description: "Maximum customers per page. Max 1000." }),
});

const endpoints = {
	listCustomers: "/v1/customers.list",
	getOrCreateCustomer: "/v1/customers.get_or_create",
	updateCustomer: "/v1/customers.update",
	getCustomer: "/v1/customers.get",
} as const;

const schemas = {
	listCustomers: listCustomersSchema,
	getOrCreateCustomer: CreateCustomerParamsV1Schema,
	updateCustomer: UpdateCustomerParamsV1Schema,
	getCustomer: GetCustomerParamsV1Schema,
} as const;

const { operation } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "listCustomers",
			description:
				"List Autumn customers. Use search, plans, subscription_status, and processors filters for customer-heavy queries. limit max is 1000. For queued/upcoming plan version queries, use subscription_status scheduled and omit the earliest matching version unless the user asks for all historical versions (versions 1,2,3 -> filter 2,3). 'live', 'paying', and active subscribers usually mean subscription_status active. When a plan is named, include the plans filter instead of listing broad customer sets. If listPlans returned matching versions, pass only relevant versions in plans[].versions, never guessed versions. For every/all/complete requests, paginate by calling again with start_cursor set to the previous response's next_cursor until next_cursor is empty.",
		}),
		operation({
			id: "getOrCreateCustomer",
			description:
				"Get an existing Autumn customer by id, or create it if missing. Use when the user explicitly wants a customer record created.",
			idempotent: true,
		}),
		operation({
			id: "updateCustomer",
			description:
				"Update an existing Autumn customer. For invoice_mode billing, set missing email with customer_id and email before previewing billing so linked Stripe customer records are updated.",
		}),
		operation({
			id: "getCustomer",
			description: "Fetch one Autumn customer by id.",
		}),
	],
} satisfies ToolDomain;

export const customers = { endpoints, schemas, domain };
