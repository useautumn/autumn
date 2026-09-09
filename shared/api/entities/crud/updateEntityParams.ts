import { z } from "zod/v4";
import { ApiEntityBillingControlsUpdateSchema } from "../../billingControls/entityBillingControls.js";

export const UpdateEntityParamsSchema = z.object({
	customer_id: z.string().optional().meta({
		description: "The ID of the customer that owns the entity.",
	}),
	entity_id: z.string().meta({
		description: "The ID of the entity.",
	}),
	billing_controls: ApiEntityBillingControlsUpdateSchema.optional().meta({
		description: "Billing controls to replace on the entity.",
	}),
	metadata: z.record(z.string(), z.any()).nullish().meta({
		description:
			"Metadata to merge onto the entity. Set a key to null to remove it.",
	}),
});

export type UpdateEntityParams = z.infer<typeof UpdateEntityParamsSchema>;
