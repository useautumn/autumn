import { z } from "zod/v4";
import { ApiEntityBillingControlsParamsSchema } from "../../billingControls/entityBillingControls.js";
import { UsageLimitUpdateSchema } from "../../billingControls/usageLimit.js";

const UpdateEntityBillingControlsSchema =
	ApiEntityBillingControlsParamsSchema.extend({
		usage_limits: z.array(UsageLimitUpdateSchema).optional(),
	});

export const UpdateEntityParamsSchema = z.object({
	customer_id: z.string().optional().meta({
		description: "The ID of the customer that owns the entity.",
	}),
	entity_id: z.string().meta({
		description: "The ID of the entity.",
	}),
	billing_controls: UpdateEntityBillingControlsSchema.optional().meta({
		description: "Billing controls to replace on the entity.",
	}),
});

export type UpdateEntityParams = z.infer<typeof UpdateEntityParamsSchema>;
