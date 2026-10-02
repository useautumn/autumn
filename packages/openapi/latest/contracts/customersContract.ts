import { createCursorPaginatedResponseSchema } from "@api/common/cursorPaginationSchemas.js";
import {
	AdvanceTestClockParamsSchema,
	AdvanceTestClockResponseSchema,
} from "@api/customers/advanceTestClock/advanceTestClock.js";
import {
	API_CUSTOMER_V5_EXAMPLE,
	ApiCustomerV5Schema,
	BaseApiCustomerV5Schema,
} from "@api/customers/apiCustomerV5.js";
import { CreateCustomerParamsV1Schema } from "@api/customers/crud/createCustomerParams.js";
import {
	DeleteCustomerParamsSchema,
	DeleteCustomerResponseSchema,
} from "@api/customers/crud/deleteCustomerParams.js";
import { GetCustomerParamsV1Schema } from "@api/customers/crud/getCustomerParams.js";
import { ListCustomersV2_3ParamsSchema } from "@api/customers/crud/listCustomersParamsV2_3.js";
import { UpdateCustomerParamsV1Schema } from "@api/customers/crud/updateCustomerParams.js";
import {
	ListPurchasesResponseSchema,
	ListSubscriptionsParamsSchema,
	ListSubscriptionsResponseSchema,
} from "@api/customers/cusPlans/list/listSubscriptions.js";
import { oc } from "@orpc/contract";
import {
	getCustomerJsDoc,
	getOrCreateCustomerJsDoc,
} from "../jsDocs/customerJsDocs";

export const getOrCreateCustomerContract = oc
	.route({
		method: "POST",
		path: "/v1/customers.get_or_create",
		operationId: "getOrCreateCustomer",
		tags: ["customers"],
		description: getOrCreateCustomerJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "getOrCreate",
		}),
	})
	.input(
		CreateCustomerParamsV1Schema.meta({
			title: "GetOrCreateCustomerParams",
			examples: [
				{
					customer_id: "cus_123",
					name: "John Doe",
					email: "john@example.com",
				},
			],
		}),
	)
	.output(ApiCustomerV5Schema);

export const getCustomerContract = oc
	.route({
		method: "POST",
		path: "/v1/customers.get",
		operationId: "getCustomer",
		tags: ["customers"],
		description: getCustomerJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "get",
		}),
	})
	.input(
		GetCustomerParamsV1Schema.meta({
			title: "GetCustomerParams",
			examples: [
				{
					customer_id: "cus_123",
				},
				{
					customer_id: "cus_123",
					expand: ["invoices", "entities"],
				},
			],
		}),
	)
	.output(
		ApiCustomerV5Schema.meta({
			examples: [API_CUSTOMER_V5_EXAMPLE],
		}),
	);

export const listCustomersContract = oc
	.route({
		method: "POST",
		path: "/v1/customers.list",
		operationId: "listCustomers",
		tags: ["customers"],
		description:
			'Lists customers with cursor pagination and optional filters. Pass `start_cursor: ""` (or omit) for the first page; use `next_cursor` from a prior response for subsequent pages.',
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "list",
		}),
	})
	.input(
		ListCustomersV2_3ParamsSchema.meta({
			title: "ListCustomersParams",
			examples: [
				{
					start_cursor: "",
					limit: 10,
				},
			],
		}),
	)
	.output(
		createCursorPaginatedResponseSchema(BaseApiCustomerV5Schema).meta({
			examples: [
				{
					list: [API_CUSTOMER_V5_EXAMPLE],
					next_cursor: null,
				},
			],
		}),
	);

export const updateCustomerContract = oc
	.route({
		method: "POST",
		path: "/v1/customers.update",
		operationId: "updateCustomer",
		tags: ["customers"],
		description:
			"Updates an existing customer by ID. Set billing_controls.balance_allocations to replace all customer-level entity allocation settings. Omit the field to leave allocations unchanged, or pass [] to release all. Include every feature and entity allocation you want to keep. Amounts are requested credits per cycle; read balances for effective allocations.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "update",
		}),
	})
	.input(
		UpdateCustomerParamsV1Schema.meta({
			title: "UpdateCustomerParams",
			examples: [
				{
					customer_id: "cus_123",
					name: "Jane Doe",
					email: "jane@example.com",
				},
			],
		}),
	)
	.output(BaseApiCustomerV5Schema);

export const deleteCustomerContract = oc
	.route({
		method: "POST",
		path: "/v1/customers.delete",
		operationId: "deleteCustomer",
		tags: ["customers"],
		description: "Deletes a customer by ID.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "delete",
		}),
	})
	.input(
		DeleteCustomerParamsSchema.meta({
			title: "DeleteCustomerParams",
			examples: [
				{
					customer_id: "cus_123",
					delete_in_stripe: false,
				},
			],
		}),
	)
	.output(DeleteCustomerResponseSchema);

export const advanceTestClockDescription =
	"Advance a customer's Stripe test clock to a future time in milliseconds. Only Stripe test-mode customers with a test clock are supported. Advancement is asynchronous; Stripe enforces clock status and advancement limits.";

export const advanceTestClockContract = oc
	.route({
		method: "POST",
		path: "/v1/customers.advance_test_clock",
		operationId: "advanceTestClock",
		tags: ["customers"],
		description: advanceTestClockDescription,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "advanceTestClock",
		}),
	})
	.input(AdvanceTestClockParamsSchema.meta({ title: "AdvanceTestClockParams" }))
	.output(
		AdvanceTestClockResponseSchema.meta({ title: "AdvanceTestClockResponse" }),
	);

const SUBSCRIPTION_LIST_ROW_EXAMPLE = {
	id: "sub_123",
	plan_id: "pro",
	auto_enable: false,
	add_on: false,
	status: "expired",
	past_due: false,
	canceled_at: 1771409161016,
	expires_at: 1771409161016,
	trial_ends_at: null,
	started_at: 1768817161016,
	current_period_start: null,
	current_period_end: null,
	quantity: 1,
	scope: "customer",
	customer_id: "cus_123",
	entity_id: null,
	created_at: 1768817161016,
};

export const listSubscriptionsContract = oc
	.route({
		method: "POST",
		path: "/v1/subscriptions.list",
		operationId: "listSubscriptions",
		tags: ["customers"],
		description:
			"Lists recurring plans (including add-ons) across customers, live or expired. Filter by customer, entity, plan, or status. Pages may hold fewer than `limit` rows while `has_more` is true.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "listSubscriptions",
		}),
	})
	.input(
		ListSubscriptionsParamsSchema.meta({
			title: "ListSubscriptionsParams",
			examples: [
				{ customer_id: "cus_123", statuses: ["expired"] },
				{ plan_id: "pro", statuses: ["past_due"] },
			],
		}),
	)
	.output(
		ListSubscriptionsResponseSchema.meta({
			examples: [
				{
					list: [SUBSCRIPTION_LIST_ROW_EXAMPLE],
					has_more: false,
					next_cursor: null,
				},
			],
		}),
	);

export const listPurchasesContract = oc
	.route({
		method: "POST",
		path: "/v1/purchases.list",
		operationId: "listPurchases",
		tags: ["customers"],
		description:
			"Lists one-off plan purchases across customers, live or expired. Filter by customer, entity, plan, or status. Pages may hold fewer than `limit` rows while `has_more` is true.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "listPurchases",
		}),
	})
	.input(
		ListSubscriptionsParamsSchema.meta({
			title: "ListPurchasesParams",
			examples: [{ customer_id: "cus_123", statuses: ["active", "expired"] }],
		}),
	)
	.output(
		ListPurchasesResponseSchema.meta({
			examples: [
				{
					list: [
						{
							id: "cus_prod_123",
							plan_id: "credit_pack",
							status: "expired",
							expires_at: null,
							started_at: 1768817161016,
							quantity: 1,
							scope: "customer",
							customer_id: "cus_123",
							entity_id: null,
							created_at: 1768817161016,
						},
					],
					has_more: false,
					next_cursor: null,
				},
			],
		}),
	);
