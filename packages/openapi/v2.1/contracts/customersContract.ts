// import { getOrCreateCustomerJsDoc } from "@api/common/jsDocs.js";
import { ApiCustomerV5Schema } from "@api/customers/apiCustomerV5.js";
import { CreateCustomerParamsV1Schema } from "@api/customers/crud/createCustomerParams";
import { oc } from "@orpc/contract";

export const getOrCreateCustomerContract = oc
	.route({
		method: "POST",
		path: "/v1/customers.getOrCreate",
		operationId: "getOrCreate",
		tags: ["customers"],
		// description: getOrCreateCustomerJsDoc,
		description:
			"Creates a customer if they do not exist, or returns the existing customer by your external customer ID.",
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
