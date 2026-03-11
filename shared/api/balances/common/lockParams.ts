import { z } from "zod/v4";

export const LockParamsSchema = z
	.object({
		lock_id: z.string().max(256),
		enabled: z.literal(true),
		hashed_key: z.string().optional().meta({
			internal: true,
		}),
		expires_at: z.number().optional(),
	})
	.meta({
		internal: true,
	});

export const ParsedLockParamsSchema = LockParamsSchema.extend({
	lock_id: z.string().max(256),
	hashed_key: z.string(),
});

export type LockParams = z.infer<typeof LockParamsSchema>;
export type ParsedLockParams = z.infer<typeof ParsedLockParamsSchema>;
