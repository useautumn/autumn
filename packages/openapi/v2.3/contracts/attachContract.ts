import { AttachParamsV0Schema } from "@api/billing/attachV2/attachParamsV0.js";
import { BillingResponseSchema } from "@api/billing/common/billingResponse.js";
import { oc } from "@orpc/contract";

export const attachContract = oc
	.route({
		method: "POST",
		path: "/v1/attach",
		operationId: "attach",
		tags: ["billing"],
	})
	.input(AttachParamsV0Schema.omit({ customer_id: true, customer_data: true }))
	.output(BillingResponseSchema);
