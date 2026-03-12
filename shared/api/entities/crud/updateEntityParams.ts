import { z } from "zod/v4";
import { ApiEntityBillingControlsInputSchema } from "../../billingControls/entityBillingControls.js";

export const UpdateEntityParamsSchema = z.object({
	customer_id: z.string().optional().meta({
		description: "The ID of the customer that owns the entity.",
	}),
	entity_id: z.string().meta({
		description: "The ID of the entity.",
	}),
	billing_controls: ApiEntityBillingControlsInputSchema.optional().meta({
		description: "Billing controls to replace on the entity.",
	}),
});

export type UpdateEntityParams = z.infer<typeof UpdateEntityParamsSchema>;
