import { peerRequestHeaders } from "../../replication/transport/peerSignature.js";
import type { HandedKey } from "../../state/journal/types/journal.js";
import type { HandOffContext } from "./handOffJournals.js";
import {
	encodeHandedKeys,
	MAX_HANDOFF_KEYS,
	PEER_KEY_HANDOFF_PATH,
} from "./handoffContract.js";

/** Requests in flight at once per thread, each up to MAX_HANDOFF_KEYS keys to one owner. */
const BATCHES_IN_FLIGHT = 4;
const HANDOFF_TIMEOUT_MS = 2_000;
/** Caller keys this young move with their customers, so a retry within the hour is 409 at the next owner too. */
export const KEY_HANDOFF_WINDOW_MS = 60 * 60_000;
/** The newest of them are handed before ownership switches; the rest stream after it, so the switch never waits on an hour of keys. */
export const KEYS_BEFORE_SWITCH_MS = 10 * 60_000;
/** Each round reaches back this far before the last one's read, past any commit then still landing. */
export const KEYS_OVERLAP_MS = 5_000;

type KeyBatch = { owner: string; atomId: string | null; keys: HandedKey[] };

const sendKeys = async ({
	ctx,
	batch,
}: {
	ctx: HandOffContext;
	batch: KeyBatch;
}): Promise<boolean> => {
	const body = encodeHandedKeys({ keys: batch.keys });
	try {
		const reply = await (ctx.peer.fetch ?? fetch)(
			`http://${batch.owner}:${ctx.peer.port}${PEER_KEY_HANDOFF_PATH}`,
			{
				method: "POST",
				headers: peerRequestHeaders({
					secret: ctx.peer.secret,
					method: "POST",
					path: PEER_KEY_HANDOFF_PATH,
					atomId: batch.atomId,
					body,
					headers: { "content-type": "application/octet-stream" },
				}),
				body,
				signal: AbortSignal.timeout(HANDOFF_TIMEOUT_MS),
			},
		);
		await reply.arrayBuffer();
		return reply.ok;
	} catch {
		return false;
	}
};

/** Every key this thread's journals logged from `since` until `until`, cut per owner and folder at the request's cap. */
const batchesOf = async ({
	ctx,
	since,
	until = Number.POSITIVE_INFINITY,
	ownerOf,
}: {
	ctx: HandOffContext;
	since: number;
	until?: number;
	ownerOf: (params: { customerId: string }) => Promise<string | null>;
}): Promise<KeyBatch[]> => {
	const batches: KeyBatch[] = [];
	for (const { atomId, slots } of ctx.folders.all()) {
		const owners = new Map<string, string | null>();
		const open = new Map<string, KeyBatch>();
		for (const journal of slots.ownedJournals())
			for (const key of await journal.keysSince({ since })) {
				if (key.appendedAt >= until) continue;
				if (!owners.has(key.customerId))
					owners.set(key.customerId, await ownerOf(key));
				const owner = owners.get(key.customerId);
				if (!owner || owner === ctx.ring.self) continue;
				let batch = open.get(owner);
				if (!batch || batch.keys.length >= MAX_HANDOFF_KEYS) {
					batch = { owner, atomId, keys: [] };
					open.set(owner, batch);
					batches.push(batch);
				}
				batch.keys.push(key);
			}
	}
	return batches;
};

/**
 * The caller keys this thread logged from `since` until `until`, sent to the replica each customer moves to, so a retry there is
 * answered 409. A batch that fails is not retried: past it, the worker's 24 h claim still keeps Autumn's count exact.
 */
export const handOffKeys = async ({
	ctx,
	since,
	until,
	ownerOf,
}: {
	ctx: HandOffContext;
	since: number;
	until?: number;
	ownerOf: (params: { customerId: string }) => Promise<string | null>;
}): Promise<{ handed: number; failed: number }> => {
	const batches = await batchesOf({ ctx, since, until, ownerOf });
	let handed = 0;
	let failed = 0;
	let next = 0;
	const lane = async () => {
		while (next < batches.length) {
			const batch = batches[next++] as KeyBatch;
			if (await sendKeys({ ctx, batch })) handed += batch.keys.length;
			else failed += batch.keys.length;
		}
	};
	await Promise.all(Array.from({ length: BATCHES_IN_FLIGHT }, lane));
	return { handed, failed };
};

/** Rounds of keys taken while the last round was sent, before the caller flips ownership regardless. */
const CATCH_UP_ROUNDS = 5;

/**
 * Hands the keys logged since `since`, then those logged while that was in flight, until a round finds none for the
 * moving customers. `complete` is false when a batch failed or keys were still arriving after the last round.
 */
export const handOffKeysUpToNow = async ({
	ctx,
	since,
	ownerOf,
}: {
	ctx: HandOffContext;
	since: number;
	ownerOf: (params: { customerId: string }) => Promise<string | null>;
}): Promise<{ handed: number; failed: number; complete: boolean }> => {
	let from = since;
	let handed = 0;
	for (let round = 0; round < CATCH_UP_ROUNDS; round++) {
		const readAt = Date.now();
		const sent = await handOffKeys({ ctx, since: from, ownerOf });
		handed += sent.handed;
		if (sent.failed > 0)
			return { handed, failed: sent.failed, complete: false };
		if (sent.handed === 0) return { handed, failed: 0, complete: true };
		// keysSince waits for the commits in flight, so every key appended before readAt was read: no overlap, or rounds never converge.
		from = readAt;
	}
	return { handed, failed: 0, complete: false };
};

/**
 * The hour's older keys, those the switch at `switchedAt` did not wait for. Until they land, a retry of one of them at
 * the next owner may deduct again.
 */
export const handOffOlderKeys = async ({
	ctx,
	switchedAt,
	ownerOf,
}: {
	ctx: HandOffContext;
	switchedAt: number;
	ownerOf: (params: { customerId: string }) => Promise<string | null>;
}): Promise<{ handed: number; failed: number; ms: number }> => {
	const startedAt = performance.now();
	const sent = await handOffKeys({
		ctx,
		since: switchedAt - KEY_HANDOFF_WINDOW_MS,
		until: switchedAt - KEYS_BEFORE_SWITCH_MS,
		ownerOf,
	});
	return { ...sent, ms: Math.round(performance.now() - startedAt) };
};
