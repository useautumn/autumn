import { z } from "zod/v4";

export const ReserveParamsSchema = z
	.object({
		enabled: z.literal(true),
		key: z.string().optional(),
		expires_at: z.string().optional(),
	})
	.meta({
		internal: true,
	});

export type ReserveParams = z.infer<typeof ReserveParamsSchema>;
