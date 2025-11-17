import { z } from "zod/v4";

export const DisplaySchema = z.object({
	primary_text: z.string(),
	secondary_text: z.string().optional(),
});
