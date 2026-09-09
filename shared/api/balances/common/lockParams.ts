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

// "reject" is the default and stays internal like on track, so public docs
// only surface "cap" and "overflow" as opt-ins.
export const LockOverageBehaviorSchema = z
	.union([
		z.enum(["cap", "overflow"]),
		z.enum(["reject"]).meta({ internal: true }),
	])
	.meta({
		description:
			'How to handle a lock that exceeds the available balance. "reject" (default) returns allowed: false and reserves nothing. "cap" reserves only what fits and returns allowed: true. "overflow" reserves the full value: the balance can go negative, though spend limits still apply. balances.finalize reuses the behavior chosen here.',
	});

export const CheckLockParamsSchema = LockParamsSchema.extend({
	overage_behavior: LockOverageBehaviorSchema.optional(),
});

export const ParsedLockParamsSchema = CheckLockParamsSchema.extend({
	lock_id: z.string().max(256),
	hashed_key: z.string(),
});

export type LockParams = z.infer<typeof LockParamsSchema>;
export type LockOverageBehavior = z.infer<typeof LockOverageBehaviorSchema>;
export type CheckLockParams = z.infer<typeof CheckLockParamsSchema>;
export type ParsedLockParams = z.infer<typeof ParsedLockParamsSchema>;
