import { z } from "zod/v4";

export const ResetJobConfigSchema = z.object({
	enabled: z.boolean().default(false),
});

export type ResetJobConfig = z.infer<typeof ResetJobConfigSchema>;
