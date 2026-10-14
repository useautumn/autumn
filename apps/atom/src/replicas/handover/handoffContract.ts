import { z } from "zod/v4";
import type { HandedKey } from "../../state/journal/types/journal.js";

export const PEER_HANDOFF_PATH = "/v1/_peer/journal.handoff";

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

/**
 * One customer's owed entries and open locks, handed to the replica that owns the customer now; entries are idempotent
 * on (writerId, seq), locks on lock_id.
 */
export const HandoffSchema = z.object({
	customerId: z.string().min(1),
	entries: z.array(HandedEntrySchema),
	locks: z.array(HandedLockSchema).default([]),
});

export type Handoff = z.infer<typeof HandoffSchema>;

/** Several customers' handoffs in one request, all from one folder. */
export const HandoffBatchSchema = z.object({
	handoffs: z.array(HandoffSchema).min(1),
});

export type HandoffBatch = z.infer<typeof HandoffBatchSchema>;

/** Customers' recent caller keys, in a binary body: 24 bytes a key, so a full window crosses inside the drain. */
export const PEER_KEY_HANDOFF_PATH = "/v1/_peer/journal.keys";

/** Keys per request: about 1.2 MB, one transaction on the receiving slot. */
export const MAX_HANDOFF_KEYS = 50_000;

const HASH_BYTES = 16;
const KEY_BYTES = HASH_BYTES + 8;

/** Grouped by customer: [u16 id length][id][u32 keys] then each key's 16-byte hash and its time as a float64. */
export const encodeHandedKeys = ({
	keys,
}: {
	keys: HandedKey[];
}): Uint8Array => {
	const byCustomer = new Map<string, HandedKey[]>();
	for (const key of keys) {
		const held = byCustomer.get(key.customerId);
		if (held) held.push(key);
		else byCustomer.set(key.customerId, [key]);
	}
	const ids = new Map(
		[...byCustomer.keys()].map((id) => [id, Buffer.from(id, "utf8")]),
	);
	const size = [...byCustomer].reduce(
		(sum, [id, held]) =>
			sum + 2 + (ids.get(id) as Buffer).length + 4 + held.length * KEY_BYTES,
		0,
	);
	const bytes = Buffer.alloc(size);
	let at = 0;
	for (const [id, held] of byCustomer) {
		const idBytes = ids.get(id) as Buffer;
		at = bytes.writeUInt16LE(idBytes.length, at);
		at += idBytes.copy(bytes, at);
		at = bytes.writeUInt32LE(held.length, at);
		for (const { keyHash, appendedAt } of held) {
			at += bytes.write(keyHash, at, HASH_BYTES, "hex");
			at = bytes.writeDoubleLE(appendedAt, at);
		}
	}
	return bytes;
};

/** Throws on a body cut short, so a malformed one is refused whole. */
export const decodeHandedKeys = ({
	body,
}: {
	body: Uint8Array;
}): HandedKey[] => {
	const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
	const keys: HandedKey[] = [];
	let at = 0;
	while (at < bytes.length) {
		const idLength = bytes.readUInt16LE(at);
		const customerId = bytes.toString("utf8", at + 2, at + 2 + idLength);
		at += 2 + idLength;
		const count = bytes.readUInt32LE(at);
		at += 4;
		if (at + count * KEY_BYTES > bytes.length)
			throw new RangeError("A key handoff ended inside its keys");
		for (let key = 0; key < count; key++, at += KEY_BYTES)
			keys.push({
				customerId,
				keyHash: bytes.toString("hex", at, at + HASH_BYTES),
				appendedAt: bytes.readDoubleLE(at + HASH_BYTES),
			});
	}
	return keys;
};
