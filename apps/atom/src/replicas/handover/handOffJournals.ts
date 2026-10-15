import type { AutumnLogger } from "@autumn/logging";
import { peerRequestHeaders } from "../../replication/transport/peerSignature.js";
import type { ReplicaFolders } from "../../replication/types/replicaFolders.js";
import type { ReplicaRing } from "../types/replicaRing.js";
import {
	type HandoffBatch,
	MAX_HANDOFF_ENTRIES,
	PEER_HANDOFF_PATH,
} from "./handoffContract.js";
import type { CustomerHandoff } from "./types/customerHandoff.js";

/** Batches in flight at once per thread, each up to MAX_HANDOFF_ENTRIES entries, locks and keys to one owner. */
const BATCHES_IN_FLIGHT = 4;
/** A new owner that has not taken a batch by then keeps answering from its copy; those entries drain to Autumn instead. */
const HANDOFF_TIMEOUT_MS = 2_000;

export type HandOffContext = {
	ring: ReplicaRing;
	folders: Pick<ReplicaFolders, "all">;
	peer: { port: number; secret: string; fetch?: typeof fetch };
	logger: Pick<AutumnLogger, "info" | "warn">;
};

type Pending = CustomerHandoff & { atomId: string | null };

const sizeOf = ({ entries, locks, keys }: Pending): number =>
	entries.length + locks.length + keys.length;

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
		handoffs: batch.items.map(({ customerId, entries, locks, keys }) => ({
			customerId,
			entries,
			locks,
			keys,
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
}: {
	ctx: HandOffContext;
	pending: Pending[];
}): Promise<{ batches: Batch[]; kept: number }> => {
	const open = new Map<string, Batch>();
	const batches: Batch[] = [];
	let kept = 0;
	for (const item of pending) {
		const owner = await ctx.ring.ownerOf({ customerId: item.customerId });
		if (owner === ctx.ring.self) {
			kept += sizeOf(item);
			continue;
		}
		const key = `${owner}\u0000${item.atomId ?? ""}`;
		let batch = open.get(key);
		if (!batch || batch.entries + sizeOf(item) > MAX_HANDOFF_ENTRIES) {
			batch = { owner, atomId: item.atomId, items: [], entries: 0 };
			open.set(key, batch);
			batches.push(batch);
		}
		batch.items.push(item);
		batch.entries += sizeOf(item);
	}
	return { batches, kept };
};

/**
 * Every customer this thread's journals owe anything for, copied to the replica that owns it now, into its journal under
 * the original writer and seq. Nothing leaves this journal: both sides send what they hold, each writer's seqs in order,
 * and Autumn's per-writer watermark takes each once, so no seq can land ahead of an earlier one that is unsent somewhere.
 */
export const handOffJournals = async ({
	ctx,
}: {
	ctx: HandOffContext;
}): Promise<{ handed: number; kept: number }> => {
	const pending: Pending[] = (
		await Promise.all(
			ctx.folders.all().map(async ({ atomId, slots }) =>
				(
					await slots.ownedHandoffs()
				).map((handoff) => ({
					atomId,
					...handoff,
				})),
			),
		)
	).flat();
	const { batches, kept: ownKept } = await batchesOf({ ctx, pending });
	let handed = 0;
	let kept = ownKept;
	let next = 0;
	const lane = async () => {
		while (next < batches.length) {
			const batch = batches[next++] as Batch;
			if (await sendBatch({ ctx, batch })) handed += batch.entries;
			else kept += batch.entries;
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
		`Copied ${handed} owed entries to the new owners in ${batches.length} batches; ${kept} reached no new owner and drain to Autumn only`,
	);
	return { handed, kept };
};
