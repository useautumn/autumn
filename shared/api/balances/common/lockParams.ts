import { z } from "zod/v4";

export const LockParamsSchema = z.object({
	lock_id: z.string().max(256).meta({
		description:
			"A unique identifier for this lock. Used to finalize the lock later via balances.finalize.",
	}),
	enabled: z.literal(true).meta({
		description: "Must be true to enable locking.",
	}),
	hashed_key: z.string().optional().meta({
		internal: true,
	}),
	expires_at: z.number().optional().meta({
		description:
			"Unix timestamp (ms) when the lock automatically expires and releases the held balance.",
	}),
});

export const ParsedLockParamsSchema = LockParamsSchema.extend({
	lock_id: z.string().max(256),
	hashed_key: z.string(),
});

export type LockParams = z.infer<typeof LockParamsSchema>;
export type ParsedLockParams = z.infer<typeof ParsedLockParamsSchema>;
