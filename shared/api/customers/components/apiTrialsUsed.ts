import { z } from "zod/v4";

export const ApiTrialsUsedSchema = z.object({
	product_id: z.string(),
	customer_id: z.string(),
	fingerprint: z.string().nullish(),
});

export type ApiTrialsUsed = z.infer<typeof ApiTrialsUsedSchema>;
