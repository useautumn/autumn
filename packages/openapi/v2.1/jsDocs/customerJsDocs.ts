import {
	CreateCustomerParamsV0Schema,
	GetCustomerParamsV1Schema,
} from "@autumn/shared";
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

export const getCustomerJsDoc = createJSDocDescription({
	description:
		"Fetches a customer by ID, optionally expanding related data such as invoices or entities.",
	whenToUse:
		"Use this when you know the customer exists or assert they exist without creating them.",
	body: GetCustomerParamsV1Schema,
	examples: [
		example({
			description: "Fetch a customer by external ID",
			values: {
				customerId: "cus_123",
			},
		}),
		example({
			description: "Fetch a customer with expanded invoices and entities",
			values: {
				customerId: "cus_123",
				expand: ["invoices", "entities"],
			},
		}),
	],
	methodName: "get",
});
