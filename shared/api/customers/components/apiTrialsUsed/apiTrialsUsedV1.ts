import { z } from "zod/v4";

export const ApiTrialsUsedV1Schema = z.object({
	plan_id: z.string(),
	customer_id: z.string(),
	fingerprint: z.string().nullish(),
});

export type ApiTrialsUsedV1 = z.infer<typeof ApiTrialsUsedV1Schema>;
