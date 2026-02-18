import { AttachParamsV1Schema } from "@autumn/shared";
import { createJSDocDescription, example } from "../../utils/jsDocs/index.js";

export const billingAttachJsDoc = createJSDocDescription({
	description:
		"Attaches a plan to a customer. Handles new subscriptions, upgrades and downgrades.",
	body: AttachParamsV1Schema,
	examples: [
		example({
			description: "Attach a plan to a customer",
			values: {
				customerId: "cus_123",
				planId: "pro_plan",
			},
		}),
	],
	methodName: "attach",
});
