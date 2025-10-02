import { z } from "zod/v4";

export const SuccessResponseSchema = z
	.object({
		success: z.boolean(),
	})
	.meta({
		id: "SuccessResponse",
	});
