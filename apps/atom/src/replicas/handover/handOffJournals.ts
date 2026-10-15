import type { AutumnLogger } from "@autumn/logging";
import { peerRequestHeaders } from "../../replication/transport/peerSignature.js";
import type {
	ReplicaFolder,
	ReplicaFolders,
} from "../../replication/types/replicaFolders.js";
import type {
	HandedEntry,
	Journal,
} from "../../state/journal/types/journal.js";
import type {
	OpenLock,
	OpenLocks,
} from "../../state/openLocks/createOpenLocks.js";
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
/** Rounds of reading and sending before the caller counts the new owner anyway: each round is only what arrived during the last. */
const MAX_HANDOFF_ROUNDS = 4;

export type HandOffContext = {
	ring: ReplicaRing;
	folders: Pick<ReplicaFolders, "all">;
	peer: { port: number; secret: string; fetch?: typeof fetch };
	logger: Pick<AutumnLogger, "info" | "warn">;
};

/** One customer's handoff from one folder: its owed entries from the slot's journal, its open locks from the slot. */
type Pending = {
	journal: Journal | null;
	atomId: string | null;
	customerId: string;
	entries: HandedEntry[];
	locks: OpenLock[];
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
		handoffs: batch.items.map(({ customerId, entries, locks }) => ({
			customerId,
			entries,
			locks,
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
		const size = item.entries.length + item.locks.length;
		const key = `${owner}\u0000${item.atomId ?? ""}`;
		let batch = open.get(key);
		if (!batch || batch.entries + size > MAX_HANDOFF_ENTRIES) {
			batch = { owner, atomId: item.atomId, items: [], entries: 0 };
			open.set(key, batch);
			batches.push(batch);
		}
		batch.items.push(item);
		batch.entries += size;
	}
	return { batches, kept };
};

/** The owed entries of each customer in the folder, one pending handoff per customer and journal. */
const pendingEntriesOf = async ({
	atomId,
	slots,
}: ReplicaFolder): Promise<Pending[]> =>
	(
		await Promise.all(
			slots.ownedJournals().map(async (journal) =>
				(
					await journal.handoffs()
				).map((handoff) => ({
					journal,
					atomId,
					locks: [],
					...handoff,
				})),
			),
		)
	).flat();

/** Where each slot's lock reads left off, so a later round or sweep hands only the locks taken since. */
export type LockMarks = Map<OpenLocks, number>;

/** The folder's open locks taken since the marks, joined onto their customer's pending handoff or a handoff of their own. */
const withPendingLocks = ({
	folder: { atomId, slots },
	pending,
	marks,
}: {
	folder: ReplicaFolder;
	pending: Pending[];
	marks: LockMarks;
}): Pending[] => {
	const byCustomer = new Map(pending.map((item) => [item.customerId, item]));
	for (const openLocks of slots.ownedOpenLocks()) {
		const { customers, heldThrough } = openLocks.all({
			heldAfter: marks.get(openLocks) ?? 0,
		});
		marks.set(openLocks, heldThrough);
		for (const { customerId, locks } of customers) {
			const item = byCustomer.get(customerId);
			if (item) item.locks.push(...locks);
			else
				byCustomer.set(customerId, {
					journal: null,
					atomId,
					customerId,
					entries: [],
					locks,
				});
		}
	}
	return [...byCustomer.values()];
};

/** What the slots hold for other owners now: owed entries not yet handed, and locks taken since the last read. */
const pendingOf = async ({
	ctx,
	marks,
}: {
	ctx: HandOffContext;
	marks: LockMarks;
}): Promise<Pending[]> =>
	(
		await Promise.all(
			ctx.folders.all().map(async (folder) =>
				withPendingLocks({
					folder,
					pending: await pendingEntriesOf(folder),
					marks,
				}),
			),
		)
	).flat();

type Round = {
	customers: number;
	batches: number;
	handed: number;
	kept: number;
	locks: number;
};

const sendRound = async ({
	ctx,
	pending,
	ownerOf,
}: {
	ctx: HandOffContext;
	pending: Pending[];
	ownerOf: (customerId: string) => Promise<string>;
}): Promise<Round> => {
	const { batches, kept: ownKept } = await batchesOf({ ctx, pending, ownerOf });
	const round: Round = {
		customers: pending.length,
		batches: batches.length,
		handed: 0,
		kept: ownKept,
		locks: 0,
	};
	let next = 0;
	const lane = async () => {
		while (next < batches.length) {
			const batch = batches[next++] as Batch;
			if (await sendBatch({ ctx, batch })) {
				await Promise.all(
					batch.items.map((item) =>
						item.journal?.dropHandedOff({ entries: item.entries }),
					),
				);
				for (const item of batch.items) {
					round.handed += item.entries.length;
					round.locks += item.locks.length;
				}
			} else for (const item of batch.items) round.kept += item.entries.length;
		}
	};
	await Promise.all(Array.from({ length: BATCHES_IN_FLIGHT }, lane));
	return round;
};

/**
 * Every customer this thread's slots owe anything for or hold a lock of, handed to the replica that owns it now: the
 * entries into its journal under the original writer and seq, the locks into its open locks; what the new owner
 * acknowledges leaves this journal, the rest drains to Autumn as before. Handed in rounds: a request answered here while
 * a batch was in flight may have taken a lock or appended an entry for a customer that moves, so the slots are read again
 * until a round finds nothing to send, and the caller counts the new owner only after the last round.
 */
export const handOffJournals = async ({
	ctx,
	ownerOf = (customerId) => ctx.ring.ownerOf({ customerId }),
	marks = new Map(),
	quiet = false,
}: {
	ctx: HandOffContext;
	/** Who takes each customer; the ring's owner unless the caller is handing to a peer about to be counted. */
	ownerOf?: (customerId: string) => Promise<string>;
	/** Carried across calls by a caller that sweeps again later, so each sweep hands only the locks taken since. */
	marks?: LockMarks;
	/** A sweep after the first handoff logs nothing of its own; the caller sums it. */
	quiet?: boolean;
}): Promise<{ handed: number; kept: number; locks: number }> => {
	const first = await sendRound({
		ctx,
		pending: await pendingOf({ ctx, marks }),
		ownerOf,
	});
	let { customers, batches, handed, kept, locks } = first;
	let rounds = 1;
	// Entries this thread keeps stay pending every round; only sent batches mean another round can find something new.
	while (rounds < MAX_HANDOFF_ROUNDS && batches > 0) {
		const pending = await pendingOf({ ctx, marks });
		const {
			batches: sent,
			handed: more,
			locks: moreLocks,
		} = await sendRound({ ctx, pending, ownerOf });
		rounds++;
		batches = sent;
		handed += more;
		locks += moreLocks;
		customers += sent > 0 ? pending.length : 0;
	}
	if (!quiet)
		ctx.logger.info(
			{
				type: "atom_handoff",
				data: {
					customers,
					batches: first.batches,
					rounds,
					handed,
					kept,
					locks,
				},
			},
			`Handed ${handed} owed entries and ${locks} open locks to the new owners in ${rounds} round(s); ${kept} entries stay to drain to Autumn`,
		);
	return { handed, kept, locks };
};
