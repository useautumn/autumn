import { z } from "zod/v4";

export const LockParamsSchema = z
	.object({
		enabled: z.literal(true),
		key: z.string().max(256),
		hashed_key: z.string().optional().meta({
			internal: true,
		}),
		expires_at: z.number().optional(),
	})
	.meta({
		internal: true,
	});

export const ParsedLockParamsSchema = LockParamsSchema.extend({
	key: z.string().max(256),
	hashed_key: z.string(),
});

export type LockParams = z.infer<typeof LockParamsSchema>;
export type ParsedLockParams = z.infer<typeof ParsedLockParamsSchema>;
