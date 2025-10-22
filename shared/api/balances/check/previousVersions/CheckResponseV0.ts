import { EntInterval } from "@models/productModels/entModels/entEnums.js";
import { z } from "zod/v4";

export const CheckResponseV0Schema = z.object({
	allowed: z.boolean(),
	balances: z.array(
		z.object({
			feature_id: z.string(),
			unlimited: z.boolean().nullish(),
			interval: z.enum(EntInterval).nullish(),
			balance: z.number().nullish(),
			used: z.number().nullish(),
		}),
	),
});

export type CheckResponseV0 = z.infer<typeof CheckResponseV0Schema>;
