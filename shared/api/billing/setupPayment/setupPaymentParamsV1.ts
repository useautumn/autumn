import { AttachParamsV1Schema, CustomerDataSchema } from "@api/models";
import { z } from "zod/v4";

export const SetupPaymentParamsV1Schema = AttachParamsV1Schema.extend({
	plan_id: z.string().optional().meta({
		description:
			"If specified, the plan will be attached to the customer after setup.",
	}),
	customer_data: CustomerDataSchema.optional().meta({
		internal: true,
	}),
}).omit({
	invoice_mode: true,
	redirect_mode: true,
	new_billing_subscription: true,
	plan_schedule: true,
});

export const SetupPaymentResponseV1Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer",
	}),

	entity_id: z.string().optional().meta({
		description:
			"The ID of the entity the plan (if specified) will be attached to after setup.",
	}),

	url: z.string().meta({
		description: "URL to redirect the customer to setup their payment.",
	}),
});

export type SetupPaymentParamsV1 = z.infer<typeof SetupPaymentParamsV1Schema>;
