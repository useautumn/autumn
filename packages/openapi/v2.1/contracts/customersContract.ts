import { createPagePaginatedResponseSchema } from "@api/common/pagePaginationSchemas.js";
import {
	ApiCustomerV5Schema,
	BaseApiCustomerV5Schema,
} from "@api/customers/apiCustomerV5.js";
import { CreateCustomerParamsV1Schema } from "@api/customers/crud/createCustomerParams.js";
import {
	DeleteCustomerParamsSchema,
	DeleteCustomerResponseSchema,
} from "@api/customers/crud/deleteCustomerParams.js";
import { ListCustomersV2ParamsSchema } from "@api/customers/crud/listCustomersParamsV2.js";
import { UpdateCustomerParamsV1Schema } from "@api/customers/crud/updateCustomerParams.js";
import { oc } from "@orpc/contract";
import { getOrCreateCustomerJsDoc } from "../jsDocs/customerJsDocs";

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

export const listCustomersContract = oc
	.route({
		method: "POST",
		path: "/v1/customers.list",
		operationId: "listCustomers",
		tags: ["customers"],
		description: "Lists customers with pagination and optional filters.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "list",
		}),
	})
	.input(
		ListCustomersV2ParamsSchema.optional().meta({
			title: "ListCustomersParams",
			examples: [
				{
					limit: 10,
					offset: 0,
				},
			],
		}),
	)
	.output(createPagePaginatedResponseSchema(BaseApiCustomerV5Schema));

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
