import { z } from "zod/v4";

export const ExistingUsagesSchema = z.record(
	z.string(),
	z.object({
		usage: z.number(),
		entityUsages: z.record(z.string(), z.number()),
	}),
);

export type ExistingUsages = z.infer<typeof ExistingUsagesSchema>;
