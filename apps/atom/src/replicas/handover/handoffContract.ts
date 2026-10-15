import { z } from "zod/v4";

export const PEER_HANDOFF_PATH = "/v1/_peer/journal.handoff";

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

/** One customer's owed entries, handed to the replica that owns the customer now; idempotent on (writerId, seq). */
export const HandoffSchema = z.object({
	customerId: z.string().min(1),
	entries: z.array(HandedEntrySchema).min(1),
});

export type Handoff = z.infer<typeof HandoffSchema>;

/** Several customers' handoffs in one request, all from one folder. */
export const HandoffBatchSchema = z.object({
	handoffs: z.array(HandoffSchema).min(1),
});

export type HandoffBatch = z.infer<typeof HandoffBatchSchema>;
