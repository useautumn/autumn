import { z } from "zod/v4";

export const BatchResetConfigSchema = z.object({
	enabled: z.boolean().default(true),
});

export type BatchResetConfig = z.infer<typeof BatchResetConfigSchema>;
