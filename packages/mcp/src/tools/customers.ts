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
			description: `
- Get an existing Autumn customer by id, or create it if missing.
- Use only when the user explicitly wants a customer record created.
- Include email when creating a customer for invoice-mode billing.
			`.trim(),
			idempotent: true,
		}),
		operation({
			id: "updateCustomer",
			description:
				"Update an existing Autumn customer. For invoice_mode billing, set missing email with customer_id and email before previewing billing so linked Stripe customer records are updated. Use billing_details for billing address, tax IDs (e.g. VAT), tax exemption, and invoice custom fields such as a PO number; these are written to the linked Stripe customer. For tax IDs use tax_ids.add and tax_ids.remove; IDs you don't list are kept. To change a VAT number, remove the old one and add the new one. address and invoice_settings.custom_fields replace the whole value, so read the current ones first (getCustomer with expand billing_details) and send them back with your change.",
			destructive: true,
		}),
		operation({
			id: "getCustomer",
			description:
				"Fetch one Autumn customer by id. Add expand billing_details to read the billing address, tax IDs, tax exemption, and invoice custom fields from Stripe.",
		}),
	],
} satisfies ToolDomain;

export const customers = { endpoints, schemas, domain };
