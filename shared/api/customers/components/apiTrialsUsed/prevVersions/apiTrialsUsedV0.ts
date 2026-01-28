import { z } from "zod/v4";

export const ApiTrialsUsedV0Schema = z.object({
	product_id: z.string(),
	customer_id: z.string(),
	fingerprint: z.string().nullish(),
});

type ApiTrialsUsedV0 = z.infer<typeof ApiTrialsUsedV0Schema>;
