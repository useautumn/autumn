import { z } from "zod/v4";

export const DbOverageAllowedSchema = z.object({
	feature_id: z.string().meta({
		description: "The feature ID this overage allowed control applies to.",
	}),
	enabled: z.boolean().default(false).meta({
		description: "Whether overage is allowed for this feature.",
	}),
});

export type DbOverageAllowed = z.infer<typeof DbOverageAllowedSchema>;
