import { z } from "zod/v4";

export const OrgLimitsConfigSchema = z.object({
	orgs: z
		.record(
			z.string(),
			z.object({
				maxCusProducts: z.number().min(1).optional(),
				maxEntities: z.number().min(1).optional(),
			}),
		)
		.default({}),
});

export type OrgLimitsConfig = z.infer<typeof OrgLimitsConfigSchema>;
