import type { AutumnLogger } from "@autumn/logging";
import { peerRequestHeaders } from "../../replication/transport/peerSignature.js";
import type { ReplicaFolders } from "../../replication/types/replicaFolders.js";
import type {
	HandedEntry,
	Journal,
} from "../../state/journal/types/journal.js";
import type { ReplicaRing } from "../types/replicaRing.js";
import {
	type HandoffBatch,
	MAX_HANDOFF_ENTRIES,
	PEER_HANDOFF_PATH,
} from "./handoffContract.js";

/** Batches in flight at once per thread, each up to MAX_HANDOFF_ENTRIES entries to one owner. */
const BATCHES_IN_FLIGHT = 4;
/** A new owner that has not taken a batch by then keeps answering from its copy; those entries drain to Autumn instead. */
const HANDOFF_TIMEOUT_MS = 2_000;

export type HandOffContext = {
	ring: ReplicaRing;
	folders: Pick<ReplicaFolders, "all">;
	peer: { port: number; secret: string; fetch?: typeof fetch };
	logger: Pick<AutumnLogger, "info" | "warn">;
};

type Pending = {
	journal: Journal;
	atomId: string | null;
	customerId: string;
	entries: HandedEntry[];
};

/** One request's worth of customers, all from one folder, all to one owner. */
type Batch = {
	owner: string;
	atomId: string | null;
	items: Pending[];
	entries: number;
};

const sendBatch = async ({
	ctx,
	batch,
}: {
	ctx: HandOffContext;
	batch: Batch;
}): Promise<boolean> => {
	const body = JSON.stringify({
		handoffs: batch.items.map(({ customerId, entries }) => ({
			customerId,
			entries,
		})),
	} satisfies HandoffBatch);
	try {
		const reply = await (ctx.peer.fetch ?? fetch)(
			`http://${batch.owner}:${ctx.peer.port}${PEER_HANDOFF_PATH}`,
			{
				method: "POST",
				headers: peerRequestHeaders({
					secret: ctx.peer.secret,
					method: "POST",
					path: PEER_HANDOFF_PATH,
					atomId: batch.atomId,
					body,
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

/** Grouped by owner and folder, cut at the request's entry cap, so each lands as one transaction on either side. */
const batchesOf = async ({
	ctx,
	pending,
	ownerOf,
}: {
	ctx: HandOffContext;
	pending: Pending[];
	ownerOf: (customerId: string) => Promise<string>;
}): Promise<{ batches: Batch[]; kept: number }> => {
	const open = new Map<string, Batch>();
	const batches: Batch[] = [];
	let kept = 0;
	for (const item of pending) {
		const owner = await ownerOf(item.customerId);
		if (owner === ctx.ring.self) {
			kept += item.entries.length;
			continue;
		}
		const key = `${owner}\u0000${item.atomId ?? ""}`;
		let batch = open.get(key);
		if (!batch || batch.entries + item.entries.length > MAX_HANDOFF_ENTRIES) {
			batch = { owner, atomId: item.atomId, items: [], entries: 0 };
			open.set(key, batch);
			batches.push(batch);
		}
		batch.items.push(item);
		batch.entries += item.entries.length;
	}
	return { batches, kept };
};

/**
 * Every customer this thread's journals owe anything for, handed to the replica that owns it now, in its journal under
 * the original writer and seq; what the new owner acknowledges leaves this journal, the rest drains to Autumn as before.
 */
export const handOffJournals = async ({
	ctx,
	ownerOf = (customerId) => ctx.ring.ownerOf({ customerId }),
}: {
	ctx: HandOffContext;
	/** Who takes each customer; the ring's owner unless the caller is handing to a peer about to be counted. */
	ownerOf?: (customerId: string) => Promise<string>;
}): Promise<{ handed: number; kept: number }> => {
	const pending: Pending[] = (
		await Promise.all(
			ctx.folders.all().flatMap(({ atomId, slots }) =>
				slots.ownedJournals().map(async (journal) =>
					(
						await journal.handoffs()
					).map((handoff) => ({
						journal,
						atomId,
						...handoff,
					})),
				),
			),
		)
	).flat();
	const { batches, kept: ownKept } = await batchesOf({ ctx, pending, ownerOf });
	let handed = 0;
	let kept = ownKept;
	let next = 0;
	const lane = async () => {
		while (next < batches.length) {
			const batch = batches[next++] as Batch;
			if (await sendBatch({ ctx, batch })) {
				await Promise.all(
					batch.items.map((item) =>
						item.journal.dropHandedOff({ entries: item.entries }),
					),
				);
				handed += batch.entries;
			} else kept += batch.entries;
		}
	};
	await Promise.all(Array.from({ length: BATCHES_IN_FLIGHT }, lane));
	ctx.logger.info(
		{
			type: "atom_handoff",
			data: {
				customers: pending.length,
				batches: batches.length,
				handed,
				kept,
			},
		},
		`Handed ${handed} owed entries to the new owners in ${batches.length} batches; ${kept} stay to drain to Autumn`,
	);
	return { handed, kept };
};
