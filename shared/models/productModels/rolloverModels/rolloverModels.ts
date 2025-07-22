import { z } from "zod";

export const RolloverModelSchema = z.object({
	id: z.string(),
	cus_ent_id: z.string(),
	balance: z.number(),
	expires_at: z.number(),
	entities: z.array(z.object({
		id: z.string(),
		balance: z.number(),
	})),
});

export type RolloverModel = z.infer<typeof RolloverModelSchema>;