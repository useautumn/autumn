import { z } from "zod/v4";
import { JournalKeyRowSchema } from "../../replication/keys/createKeyRelay.js";

export const PEER_HANDOFF_PATH = "/v1/_peer/journal.handoff";
/** On a request hopped to a customer's owner: the peer the customer came from, whose handoff its first requests wait for. */
export const MOVED_FROM_HEADER = "x-atom-moved-from";

/** How long the new owner holds a moved customer's first requests for its handoff before answering from its own copy. */
export const HANDOFF_BARRIER_MS = 50;
/** Entries per handoff request: one transaction on each side, as tracks.append's batches are for Autumn. */
export const MAX_HANDOFF_ENTRIES = 500;

/** An owed entry as it crosses replicas: the worker's command with the journal's bookkeeping, and whether Autumn took it. */
const HandedEntrySchema = z.object({
	customerId: z.string().min(1),
	writerId: z.string().min(1),
	seq: z.number().int().positive(),
	appendedAt: z.number().int().nonnegative(),
	command: z.record(z.string(), z.unknown()),
	sent: z.boolean(),
});

/** An open lock as it crosses replicas: the track that took it and the row it inserted, so the new owner can settle it. */
const HandedLockSchema = z.object({
	track: z.record(z.string(), z.unknown()),
	row: z.record(z.string(), z.unknown()),
});

/** One customer's owed entries, open locks and recent keys for the replica that owns it now; idempotent on (writerId, seq), lock_id and key. */
export const HandoffSchema = z.object({
	customerId: z.string().min(1),
	entries: z.array(HandedEntrySchema),
	locks: z.array(HandedLockSchema),
	keys: z.array(JournalKeyRowSchema),
});

export type Handoff = z.infer<typeof HandoffSchema>;

/** Several customers' handoffs in one request, all from one folder. */
export const HandoffBatchSchema = z.object({
	handoffs: z.array(HandoffSchema).min(1),
});

export type HandoffBatch = z.infer<typeof HandoffBatchSchema>;
