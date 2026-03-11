import { z } from "zod/v4";
import { ApiEntitySpendLimitSchema } from "./entitySpendLimit.js";

export const ApiEntityBillingControlsSchema = z.object({
	spend_limits: z.array(ApiEntitySpendLimitSchema).optional().meta({
		description: "List of overage spend limits per feature.",
	}),
});

export type ApiEntityBillingControls = z.infer<
	typeof ApiEntityBillingControlsSchema
>;
export type ApiEntityBillingControlsInput = z.input<
	typeof ApiEntityBillingControlsSchema
>;
