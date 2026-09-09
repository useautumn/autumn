import { PaginationDefaults } from "@autumn/shared";
import { z } from "zod/v4";

const PaginationOverrideSchema = z
	.record(
		z.string(),
		z.object({
			maxLimit: z
				.number()
				.int()
				.min(1)
				.max(PaginationDefaults.SchemaHardCeiling),
		}),
	)
	.optional();

export const OrgLimitsConfigSchema = z.object({
	orgs: z
		.record(
			z.string(),
			z.object({
				maxCusProducts: z.number().min(1).optional(),
				maxEntities: z.number().min(1).optional(),
				pagination: PaginationOverrideSchema,
			}),
		)
		.default({}),
});

export type OrgLimitsConfig = z.infer<typeof OrgLimitsConfigSchema>;
