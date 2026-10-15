import { z } from "zod/v4";
import type { JournalKeyRow } from "../../state/journal/types/journal.js";
import type { Replication } from "../types/replication.js";
import type { ReplicationHandler } from "../types/replicationHandler.js";

/** A key row lands with INSERT OR IGNORE, so a relay delivered twice, or after a catch-up copied it, changes nothing. */
export const KEYS_RELAY: ReplicationHandler = {
	kind: "keys.relay",
	path: "/v1/_peer/keys.relay",
};

/** Keyed tracks inside this window cross as one request, as the journal forwarder lingers for a burst. */
const KEYS_RELAY_LINGER_MS = 20;

export const JournalKeyRowSchema = z.object({
	customerId: z.string().min(1),
	keyHash: z.string().regex(/^[0-9a-f]{32}$/),
	appendedAt: z.number().int().nonnegative(),
});

export const RelayedKeysSchema = z.object({
	keys: z.array(JournalKeyRowSchema).min(1),
});

/** One per thread: the idempotency key rows its journals commit, on their way to every other replica. */
export type KeyRelay = {
	relayKeys(params: { atomId: string | null; keys: JournalKeyRow[] }): void;
};

export const createKeyRelay = ({
	ctx,
}: {
	ctx: { replication: Pick<Replication, "replicate"> };
}): KeyRelay => {
	const waiting = new Map<string | null, JournalKeyRow[]>();
	let batches = 0;
	let lingering = false;

	function sendWaiting(): void {
		lingering = false;
		for (const [atomId, keys] of waiting)
			ctx.replication.replicate({
				kind: KEYS_RELAY.kind,
				// Every batch its own: the outbox replaces a waiting copy of the same key, and no batch replaces another.
				key: String(batches++),
				body: JSON.stringify({ keys }),
				atomId,
			});
		waiting.clear();
	}

	return {
		relayKeys: ({ atomId, keys }) => {
			const folderKeys = waiting.get(atomId);
			if (folderKeys) folderKeys.push(...keys);
			else waiting.set(atomId, [...keys]);
			if (lingering) return;
			lingering = true;
			setTimeout(sendWaiting, KEYS_RELAY_LINGER_MS);
		},
	};
};
