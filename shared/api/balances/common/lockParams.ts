import { z } from "zod/v4";

export const LockParamsSchema = z
	.object({
		enabled: z.literal(true),
		key: z.string().max(256).optional(),
		hashed_key: z.string().optional().meta({
			internal: true,
		}),
		expires_at: z.string().optional(),
	})
	.meta({
		internal: true,
	});

export type LockParams = z.infer<typeof LockParamsSchema>;
