import { CreateCustomerParamsV0Schema } from "@autumn/shared";
import { createJSDocDescription, example } from "../../utils/jsDocs/index.js";

export const getOrCreateCustomerJsDoc = createJSDocDescription({
	description:
		"Creates a customer if they do not exist, or returns the existing customer by your external customer ID.",
	whenToUse:
		"Use this as the primary entrypoint before billing operations so the customer record is always present and up to date.",
	body: CreateCustomerParamsV0Schema.partial(),
	examples: [
		example({
			description: "Create or fetch a customer by external ID",
			values: {
				customerId: "cus_123",
				name: "John Doe",
				email: "john@example.com",
			},
		}),
	],
	methodName: "getOrCreate",
});
