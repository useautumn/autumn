import { z } from "zod/v4";
import { DbSpendLimitSchema } from "./spendLimit.js";

export const EntityBillingControlsSchema = z.object({
	spend_limits: z.array(DbSpendLimitSchema).optional().meta({
		description: "List of overage spend limits per feature.",
	}),
});

export type EntityBillingControls = z.infer<typeof EntityBillingControlsSchema>;
export type EntityBillingControlsInput = z.input<
	typeof EntityBillingControlsSchema
>;
