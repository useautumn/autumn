import { createCursorPaginatedResponseSchema } from "@api/common/cursorPaginationSchemas.js";
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
			"Lists customers with cursor pagination and optional filters. Pass `cursor: \"\"` (or omit) for the first page; use `next_cursor` from a prior response for subsequent pages.",
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
					cursor: "",
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
		description: "Updates an existing customer by ID.",
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
