import { z } from "zod/v4";

export const PEER_HANDOFF_PATH = "/v1/_peer/journal.handoff";

/** How long the new owner holds a moved customer's first requests for its handoff before answering from its own copy. */
export const HANDOFF_BARRIER_MS = 50;

/** An owed entry as it crosses replicas: the worker's command with the journal's bookkeeping, and whether Autumn took it. */
const HandedEntrySchema = z.object({
	customerId: z.string().min(1),
	writerId: z.string().min(1),
	seq: z.number().int().positive(),
	appendedAt: z.number().int().nonnegative(),
	command: z.record(z.string(), z.unknown()),
	sent: z.boolean(),
});

/** One customer's owed entries, handed to the replica that owns the customer now; idempotent on (writerId, seq). */
export const HandoffSchema = z.object({
	customerId: z.string().min(1),
	entries: z.array(HandedEntrySchema).min(1),
});

export type Handoff = z.infer<typeof HandoffSchema>;
