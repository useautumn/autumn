import { z } from "zod/v4";

export const MigrationParamsSchema = z.object({
	draft: z.boolean().optional().default(false),
	include_custom: z.boolean().optional(),
});

export type MigrationParams = z.infer<typeof MigrationParamsSchema>;
export type MigrationParamsInput = z.input<typeof MigrationParamsSchema>;
