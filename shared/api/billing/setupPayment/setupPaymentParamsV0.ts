import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData";

export const SetupPaymentParamsV0Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer",
	}),
	success_url: z.string().optional().meta({
		description:
			"URL to redirect to after successful payment setup. Must start with either http:// or https://",
	}),

	checkout_session_params: z.record(z.string(), z.unknown()).optional().meta({
		description: "Additional parameters for the checkout session",
	}),

	customer_data: CustomerDataSchema.optional(),
});

export const SetupPaymentResponseV0Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer",
	}),
	url: z.string().meta({
		description: "URL to the payment setup page",
	}),
});

export type SetupPaymentParamsV0 = z.infer<typeof SetupPaymentParamsV0Schema>;
export type SetupPaymentResponseV0 = z.infer<
	typeof SetupPaymentResponseV0Schema
>;
