import { getOrCreateCustomerJsDoc } from "@api/common/jsDocs.js";
import { ApiCustomerV5Schema } from "@api/customers/apiCustomerV5.js";
import { ExtCreateCustomerParamsSchema } from "@api/customers/crud/createCustomerParams";
import { oc } from "@orpc/contract";

export const getOrCreateCustomerContract = oc
	.route({
		method: "POST",
		path: "/v1/customers.getOrCreate",
		operationId: "getOrCreate",
		tags: ["customers"],
		description: getOrCreateCustomerJsDoc,
	})
	.input(
		ExtCreateCustomerParamsSchema.meta({
			title: "GetOrCreateCustomerParams",
		}),
	)
	.output(ApiCustomerV5Schema);
